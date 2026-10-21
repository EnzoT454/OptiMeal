"""Préparation et actualisation locale des correspondances reçu ↔ fiche Maxi."""
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import tempfile
import time

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from backend.app.catalog.formats import validated_barcode
from backend.app.price_sources.pcx_products import PCXProducts, product_id_from_url
from backend.app.receipts.schemas import Money, ReceiptExtraction


class ReceiptWebInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    product_code: str = Field(pattern=r'^\d+$')
    name: str = Field(min_length=1)
    prix_extrait: Money | None
    url: str = ''
    store_id: str = Field(pattern=r'^\d+$')
    date_achat: date | None = None
    source_receipt: str
    line_id: int = Field(gt=0)


INPUTS = TypeAdapter(list[ReceiptWebInput])


def read_inputs(path: Path) -> list[ReceiptWebInput]:
    rows = INPUTS.validate_json(path.read_text(encoding='utf-8'))
    keys = [(r.product_code, r.store_id) for r in rows]
    if len(keys) != len(set(keys)):
        raise ValueError('Entrées dupliquées pour un même code et magasin.')
    return rows


def write_json_atomic(path: Path, value: object) -> None:
    """Remplacer un JSON complet seulement après écriture réussie."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2, default=str) + '\n'
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix=path.name + '.', suffix='.tmp', delete=False) as f:
            temporary = Path(f.name)
            f.write(text)
        temporary.replace(path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def prepare(receipts: list[Path], output: Path) -> list[ReceiptWebInput]:
    if output.resolve() in {p.resolve() for p in receipts}:
        raise ValueError('La sortie doit être distincte des reçus.')
    existing = read_inputs(output) if output.exists() else []
    entries = {(r.product_code, r.store_id): r for r in existing}
    for path in receipts:
        receipt = ReceiptExtraction.model_validate_json(path.read_text(encoding='utf-8'))
        if receipt.retailer != 'maxi' or not receipt.store_id:
            raise ValueError(f'{path.name} : reçu Maxi avec magasin requis.')
        for item in receipt.items:
            if not item.product_code or not item.product_code.isascii() or not item.product_code.isdigit():
                continue
            key = (item.product_code, receipt.store_id)
            old = entries.get(key)
            if old and (old.date_achat or date.min) > (receipt.purchase_date or date.min):
                continue
            entries[key] = ReceiptWebInput(
                product_code=item.product_code, name=item.name, prix_extrait=item.line_total,
                url=old.url if old else '', store_id=receipt.store_id,
                date_achat=receipt.purchase_date, source_receipt=str(path), line_id=item.line_id)
    result = list(entries.values())
    write_json_atomic(output, [r.model_dump(mode='json') for r in result])
    return result


def normalized_product(payload: dict, row: ReceiptWebInput, product_id: str) -> dict:
    if payload.get('code') != product_id:
        raise ValueError('unexpected_product_id')
    gtin = validated_barcode(payload.get('gtin'))
    if not gtin:
        raise ValueError('invalid_or_missing_gtin')
    padded = gtin.zfill(14)
    matches = (len(row.product_code) == 11 and padded[:2] == '00'
               and padded[2:-1] == row.product_code) or (
                   validated_barcode(row.product_code) is not None
                   and row.product_code.zfill(14) == padded)
    if not matches:
        raise ValueError('receipt_code_gtin_mismatch')
    offers = payload.get('offers')
    if not isinstance(offers, list) or len(offers) != 1 or not isinstance(offers[0], dict):
        raise ValueError('missing_or_ambiguous_offers')
    price = offers[0].get('price')
    if not isinstance(price, dict):
        raise ValueError('missing_price')
    try:
        amount = Decimal(str(price['value']))
        if not amount.is_finite() or amount < 0 or amount != amount.quantize(Decimal('0.01')):
            raise ValueError('invalid_price')
    except (KeyError, InvalidOperation):
        raise ValueError('invalid_price') from None
    for field in ('name', 'packageSize'):
        if not isinstance(payload.get(field), str) or not payload[field].strip():
            raise ValueError('missing_product_details')
    if not isinstance(price.get('type'), str) or not price['type']:
        raise ValueError('missing_price_type')
    return {
        'product_code': row.product_code, 'maxi_product_id': product_id,
        'produit': payload['name'], 'marque': payload.get('brand'),
        'format': payload['packageSize'], 'prix_web': format(amount, '.2f'),
        'type_fournisseur': price['type'], 'store_id': row.store_id,
        'currency': 'CAD', 'gtin': gtin,
        'url': row.url.split('?')[0], 'offres': offers,
        'pricing_units': payload.get('pricingUnits'),
    }


def update(rows: list[ReceiptWebInput], output: Path, client: PCXProducts,
           requested_date: date, delay: float = 1) -> dict:
    existing = json.loads(output.read_text(encoding='utf-8')) if output.exists() else []
    if not isinstance(existing, list) or not all(isinstance(r, dict) for r in existing):
        raise ValueError('Le fichier de correspondances doit contenir une liste.')
    matches = {}
    for record in existing:
        key = (record['product_code'], record['store_id'])
        if key in matches or not record.get('date_ajout') or not record.get('last_update'):
            raise ValueError('Correspondances existantes dupliquées ou dates manquantes.')
        matches[key] = record
    report = {'requested_date': requested_date.isoformat(),
              'attempted_at': datetime.now(timezone.utc).isoformat(), 'items': []}
    for row in rows:
        entry = {'product_code': row.product_code, 'store_id': row.store_id}
        if not row.url.strip():
            entry['status'] = 'missing_url'
        else:
            try:
                product_id = product_id_from_url(row.url.strip())
                payload = client.fetch(product_id, row.store_id, requested_date)
                record = normalized_product(payload, row, product_id)
                now = datetime.now(timezone.utc).isoformat()
                old = matches.get((row.product_code, row.store_id))
                record.update(date_ajout=old['date_ajout'] if old else now,
                              last_update=now, requested_date=requested_date.isoformat())
                matches[(row.product_code, row.store_id)] = record
                entry['status'] = 'updated'
            except ValueError as exc:
                entry.update(status='failed', error=str(exc))
            if delay:
                time.sleep(delay)
        report['items'].append(entry)
    write_json_atomic(output, list(matches.values()))
    return report
