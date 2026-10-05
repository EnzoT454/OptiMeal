"""Adaptation des données Apify au catalogue partagé, sans approbation implicite."""
import json
import math
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError
from decimal import Decimal

from backend.app.price_sources.apify_loblaws import ACTOR, BASE, ApifyClient, ApifyError
from .formats import parse_format
from .export import identifier
from .matching import match_name
from .schemas import CatalogExport, CatalogOffer, CatalogProduct, Coverage, Ingredient, IngredientMatch, ProductFormat


class ApifyRow(BaseModel):
    model_config = ConfigDict(extra='allow', coerce_numbers_to_str=True)
    product_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    store: str
    price: Annotated[Decimal, Field(ge=0, allow_inf_nan=False)]
    was_price: Annotated[Decimal, Field(ge=0, allow_inf_nan=False)] | None = None
    location: str | None = None
    package_size: str | None = None
    brand: str | None = None
    product_url: str | None = None
    selling_type: str | None = None
    is_on_sale: StrictBool | None = None
    unit_price: str | None = None
    multi_buy_deal: str | None = None
    pc_optimum_offer: str | None = None


def save_archive(path: Path, archive: dict):
    path.write_text(json.dumps(archive, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def validate_archive(archive: dict):
    if archive.get('schema_version') != 'apify-capture-1.0' or archive.get('actor') != ACTOR:
        raise ValueError('Archive Apify inconnue.')
    ingredients = [Ingredient.model_validate(i) for i in archive['ingredients']]
    if not 1 <= len(ingredients) <= 100 or len({i.id for i in ingredients}) != len(ingredients):
        raise ValueError('Il faut de 1 à 100 ingrédients distincts.')
    if archive['target_store']['retailer_id'] != 'maxi' or archive['input']['banner'] != 'maxi':
        raise ValueError('Ce connecteur est configuré pour Maxi.')
    if archive['dataset_kind'] not in ('real', 'demo'):
        raise ValueError('Nature des données invalide.')
    if not isinstance(archive['rows'], list):
        raise ValueError('Lignes d’archive invalides.')
    if type(archive['max_items']) is not int or not 1 <= archive['max_items'] <= 10000:
        raise ValueError('Limite de résultats invalide.')
    charge = archive['max_charge_usd']
    if type(charge) not in (int, float) or not math.isfinite(charge) or not 0 < charge <= 10:
        raise ValueError('Budget Apify invalide.')
    if type(archive.get('capture_complete')) is not bool:
        raise ValueError('État de capture invalide.')
    if not archive['input'].get('locationId') and not archive['input'].get('postal_code'):
        raise ValueError('Sélection de succursale absente.')
    if datetime.fromisoformat(archive['evaluated_at']).tzinfo is None:
        raise ValueError('Date sans fuseau.')


async def capture(client: ApifyClient, archive: dict, path: Path, resume: bool = False, persist=None):
    save = persist or (lambda: save_archive(path, archive))
    save()
    try:
        if not resume:
            archive['start_requested'] = True
            save()
            run = await client.start(archive['input'], archive['max_items'], archive['max_charge_usd'])
            # Sauver l'identifiant immédiatement pour reprendre sans second POST payant.
            archive['run_id'] = run['id']
            save()
        run = await client.wait(archive['run_id'])
        archive['run_status'] = run['status']
        archive['dataset_id'] = run['defaultDatasetId']
        archive['evaluated_at'] = datetime.now(timezone.utc).isoformat()
        save()
        def on_page(rows):
            archive['rows'] = rows
            save()
        await client.items(archive['dataset_id'], archive['max_items'], on_page)
        archive['capture_complete'] = True
        archive['capture_error'] = None
    except (ApifyError, KeyError):
        archive['capture_complete'] = False
        archive['capture_error'] = 'collection_incomplete_resume_required'
        save()
        raise
    save()


def normalize_archive(archive: dict) -> CatalogExport:
    validate_archive(archive)
    ingredients = [Ingredient.model_validate(i) for i in archive['ingredients']]
    target, stamp = archive['target_store'], archive['evaluated_at']
    products, offers, matches, errors = {}, {}, {}, []
    expected = archive['input'].get('locationId')
    for index, raw in enumerate(archive['rows']):
        try:
            row = ApifyRow.model_validate(raw)
        except ValidationError:
            errors.append({'row': index, 'error': 'invalid_product_row'})
            continue
        if row.store.strip().casefold() not in ('maxi', 'maxi & cie') or (expected and row.location != expected):
            errors.append({'row': index, 'error': 'retailer_or_location_mismatch'})
            continue
        if archive['input'].get('on_sale_only') is True and row.is_on_sale is not True:
            errors.append({'row': index, 'error': 'promotion_flag_missing_or_false'})
            continue
        if archive.get('food_categories'):
            category = str(raw.get('category', '')).lower()
            non_food_category = re.search(r'health-beauty|household|pet-food|pet-care|cosmetic|supplements', category)
            non_food_name = re.search(r'\b(?:cat food|dog food|pet food|shampoo|conditioner|detergent|dish soap|body wash|cat litter)\b', row.name, re.I)
            if non_food_category or non_food_name:
                errors.append({'row': index, 'error': 'non_food_result_excluded'})
                continue
        warnings = ['online_price_not_verified_in_store', 'ingredient_match_requires_review',
                    'promotion_conditions_require_review']
        if row.selling_type == 'by_weight':
            fmt = ProductFormat(raw=row.package_size, kind='variable_weight',
                                warnings=['provider_weight_may_be_estimated'])
        else:
            fmt = parse_format(row.package_size)
        pid = identifier('apify_product_', row.product_id, row.package_size or '')
        product = CatalogProduct(id=pid, external_product_id=row.product_id,
                                 name=row.name, brand=row.brand, format=fmt)
        products[pid] = product
        oid = identifier('apify_offer_', pid, row.location or '', stamp,
                         json.dumps(raw, sort_keys=True, ensure_ascii=False))
        offers[oid] = CatalogOffer(
            id=oid, product_id=pid, retailer_id='maxi',
            source_name='apify_loblaws', external_store_id=row.location,
            source_unit_price=row.unit_price, multi_buy_deal=row.multi_buy_deal,
            loyalty_offer=row.pc_optimum_offer,
            scope_kind='source_reported_store' if row.location else 'unknown',
            amount=row.price, regular_price=row.was_price, is_promotion=row.is_on_sale,
            observed_at=stamp, retrieved_at=stamp,
            source_url=f"{BASE}/datasets/{archive.get('dataset_id', 'unknown')}/items",
            retailer_url=row.product_url, capture_id=f'row_{index}',
            warnings=warnings + fmt.warnings + ['sale_basis_unknown'],
        )
        for ingredient in ingredients:
            status, reasons = match_name(ingredient, row.name)
            if reasons != ['no_alias_match']:
                matches[(ingredient.id, pid)] = IngredientMatch(
                    ingredient_id=ingredient.id, product_id=pid, status=status, reasons=reasons)
    coverage = []
    for ingredient in ingredients:
        ids = {m.product_id for m in matches.values()
               if m.ingredient_id == ingredient.id and m.status == 'suggested'}
        count = sum(o.product_id in ids for o in offers.values())
        coverage.append(Coverage(ingredient_id=ingredient.id, candidate_count=len(ids),
                                 offer_count=count, status='review_required' if count else 'no_reference_found'))
    if not archive.get('capture_complete'):
        errors.append({'error': 'capture_incomplete'})
    return CatalogExport(
        dataset_kind=archive['dataset_kind'], evaluated_at=stamp, target_store=target,
        ingredients=ingredients, products=list(products.values()), offers=list(offers.values()),
        matches=list(matches.values()), coverage=coverage,
        collection={'source': 'apify_loblaws', 'strategy': 'targeted',
                    'rows_by_query': dict(Counter(str(r.get('category', 'unknown')) for r in archive['rows'] if isinstance(r, dict))),
                    'requested_queries': archive['input'].get('search_terms', archive['input'].get('categories', [])),
                    'capture_count': len(archive['rows']), 'errors': errors,
                    'truncations': ['result_limit_reached'] if len(archive['rows']) >= archive['max_items'] else [],
                    'rejected_search_rows': [], 'complete_catalog': False,
                    'run_id': archive.get('run_id'), 'dataset_id': archive.get('dataset_id')},
        warnings=['source_reported_location_requires_identity_check', 'bounded_sample_not_store_inventory',
                  'no_automatic_ingredient_approval'],
    )
