"""Assembler les catalogues locaux sans inférer de correspondances ni de prix."""
import hashlib
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import quote

from .common_schemas import CommonCatalog


PRODUCT_FIELDS = {
    'Id', 'Description', 'Id_magasin', 'Prix', 'Unité', 'Quantité',
    'DateDebut', 'DateFin', 'IsPromotion', 'Source', 'Url',
}
# Champs ajoutés pour la page Promos (demandes du prof) : tous présents ou tous absents.
# Prix = prix de base ; PrixPromo = prix en promotion (null sinon).
PROMO_FIELDS = {'PrixPromo', 'DateRecuperation'}


def decimal_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError('Une quantité ou un prix ne peut pas être un booléen.')
    try:
        amount = Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError('Quantité ou prix décimal illisible.') from exc
    if not amount.is_finite() or amount < 0:
        raise ValueError('Une quantité ou un prix doit être fini et positif ou nul.')
    return str(amount)


def build_common_catalog(root: Path, mapping_path: Path) -> dict:
    """Les clés communes proviennent uniquement de la correspondance explicite.

    Refuser les lignes ajoutées, supprimées ou renommées sans mise à jour de
    cette correspondance évite une perte de données ou un rapprochement erroné.
    """
    root = root.resolve()
    inputs = []

    def read(path: str | Path):
        path = (root / path).resolve()
        raw = path.read_bytes()
        label = path.relative_to(root).as_posix() if path.is_relative_to(root) else path.as_posix()
        inputs.append({'path': label, 'sha256': hashlib.sha256(raw).hexdigest()})
        return json.loads(raw, parse_float=Decimal)

    mapping = read(mapping_path)
    # Liste des catégories avec leur identifiant (facultative)
    categories_list = read(mapping['categories']) if 'categories' in mapping else None
    category_ids = None
    if categories_list is not None:
        category_ids = {c['name']: c['id'] for c in categories_list}
        if len(category_ids) != len(categories_list) or \
                len({c['id'] for c in categories_list}) != len(categories_list):
            raise ValueError('Catégorie ou identifiant de catégorie dupliqué.')
    definitions = {}
    for path in mapping['ingredient_configs']:
        for ingredient in read(path)['ingredients']:
            if ingredient['id'] in definitions:
                raise ValueError(f"Identifiant commun dupliqué : {ingredient['id']}")
            definitions[ingredient['id']] = ingredient
    catalogs = {}
    for retailer, path in mapping['sources'].items():
        rows = read(path)
        indexed = {row['Id']: row for row in rows}
        if len(indexed) != len(rows):
            raise ValueError(f'Identifiant ingrédient dupliqué dans {path}.')
        catalogs[retailer] = indexed

    ingredients, seen, used = [], set(), {retailer: set() for retailer in catalogs}
    for entry in mapping['ingredients']:
        key = entry['ingredient_id']
        if key in seen or key not in definitions:
            raise ValueError(f'Identifiant commun dupliqué ou inconnu : {key}')
        seen.add(key)
        definition = definitions[key]
        if entry['name'] != definition['name']:
            raise ValueError(f'Nom commun modifié pour {key} : actualiser la correspondance.')
        if set(entry['source_rows']) != set(catalogs):
            raise ValueError(f'Enseignes manquantes ou inconnues pour {key}.')
        sources, products = [], []
        aliases = [definition['name'], *definition['aliases']]
        categories = set()
        product_ids = set()
        for retailer, reference in entry['source_rows'].items():
            row = catalogs[retailer].get(reference['id'])
            if row is None or row['NomProduit'] != reference['name']:
                raise ValueError(f'Ligne source modifiée : {retailer}/{reference["id"]} pour {key}.')
            if reference['id'] in used[retailer]:
                raise ValueError(f'Ligne source affectée deux fois : {retailer}/{reference["id"]}.')
            used[retailer].add(reference['id'])
            categories.add(row['Categorie'])
            aliases.extend([row['NomProduit'], *row['alias']])
            sources.append({'retailer': retailer, 'path': mapping['sources'][retailer],
                            'ingredient_id': row['Id'], 'name': row['NomProduit']})
            for product in row['Produits']:
                if set(product) not in (PRODUCT_FIELDS, PRODUCT_FIELDS | PROMO_FIELDS):
                    raise ValueError(f'Champs produit modifiés dans {retailer}/{row["Id"]}.')
                if not isinstance(product['Id'], str) or not product['Id']:
                    raise ValueError('Un identifiant marchand doit être un texte non vide.')
                store = product['Id_magasin']
                if store is not None and not isinstance(store, str):
                    raise ValueError('Un identifiant de succursale doit être un texte ou null.')
                product_id = ':'.join(quote(value, safe='') for value in
                                      (retailer, store or '', product['Id']))
                if product_id in product_ids:
                    raise ValueError(f'Fiche produit dupliquée pour {key} : {product_id}')
                product_ids.add(product_id)
                products.append({
                    'id': product_id, 'retailer': retailer, 'store_id': store,
                    'external_product_id': product['Id'], 'name': product['Description'],
                    'price': decimal_text(product['Prix']),
                    'promo_price': decimal_text(product.get('PrixPromo')),
                    'currency': 'CAD',
                    'unit': product['Unité'], 'quantity': decimal_text(product['Quantité']),
                    'valid_from': product['DateDebut'], 'valid_to': product['DateFin'],
                    'retrieved_at': product.get('DateRecuperation'),
                    'is_promotion': product['IsPromotion'],
                    'source': product['Source'], 'url': product['Url'],
                })
        if len(categories) != 1:
            raise ValueError(f'Catégories incohérentes pour {key}.')
        category = categories.pop()
        category_id = None
        if category_ids is not None:
            if category not in category_ids:
                raise ValueError(f'Catégorie absente de la liste des catégories : {category}')
            category_id = category_ids[category]
        ingredients.append({'id': key, 'name': definition['name'],
                            'category': category, 'category_id': category_id,
                            'aliases': list(dict.fromkeys(aliases)),
                            'sources': sources, 'products': products})
    if seen != set(definitions):
        raise ValueError('La correspondance ne couvre pas tous les ingrédients configurés.')
    for retailer, catalog in catalogs.items():
        if used[retailer] != set(catalog):
            raise ValueError(f'La correspondance ne couvre pas toutes les lignes {retailer}.')
    result = {
        'schema_version': 'common-catalog-1.0',
        'status': 'assembled_from_local_sources',
        'mapping_status': mapping['status'],
        'inputs': inputs,
        'ingredient_count': len(ingredients),
        'product_count': sum(len(i['products']) for i in ingredients),
        'categories': categories_list,
        'ingredients': ingredients,
    }
    CommonCatalog.model_validate(result)
    return result