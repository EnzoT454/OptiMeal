"""Assemblage local : correspondances explicites, conservation et régénération."""
import json
import shutil
import sys
from decimal import Decimal
from pathlib import Path

import pytest

from backend.app.catalog.common_catalog import build_common_catalog
from backend.cli import build_common_catalog as cli

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def sources(tmp_path):
    mapping = json.loads((ROOT / cli.MAPPING).read_text(encoding='utf-8'))
    categories = [mapping['categories']] if 'categories' in mapping else []
    for relative in [cli.MAPPING, *categories, *mapping['ingredient_configs'], *mapping['sources'].values()]:
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / relative, target)
    return tmp_path


def test_common_catalog_keeps_every_source_value_and_recipe_reference():
    catalog = build_common_catalog(ROOT, cli.MAPPING)
    assert catalog == json.loads((ROOT / cli.OUTPUT).read_text(encoding='utf-8'))
    assert catalog['ingredient_count'] == 31
    assert catalog['product_count'] == 93
    indexed = {i['id']: i for i in catalog['ingredients']}
    assert len(indexed) == 31
    tomato = indexed['ing_tomate_fraiche']
    banana = indexed['ing_banane_fraiche']
    assert {s['retailer']: s['ingredient_id'] for s in tomato['sources']} == {
        'superc': 4, 'metro': 4, 'maxi': 11,
    }
    assert {s['retailer']: s['ingredient_id'] for s in banana['sources']} == {
        'superc': 9, 'metro': 9, 'maxi': 4,
    }
    product_ids = []
    for ingredient in catalog['ingredients']:
        for source in ingredient['sources']:
            rows = json.loads((ROOT / source['path']).read_text(encoding='utf-8'), parse_float=Decimal)
            row = next(r for r in rows if r['Id'] == source['ingredient_id'])
            assert set(row['alias']) <= set(ingredient['aliases'])
            products = [p for p in ingredient['products'] if p['retailer'] == source['retailer']]
            assert len(products) == len(row['Produits'])
            fields = {'external_product_id': 'Id', 'store_id': 'Id_magasin', 'name': 'Description',
                      'unit': 'Unité', 'valid_from': 'DateDebut', 'valid_to': 'DateFin',
                      'is_promotion': 'IsPromotion', 'source': 'Source', 'url': 'Url',
                      'retrieved_at': 'DateRecuperation'}
            for actual, original in zip(products, row['Produits'], strict=True):
                for output_key, input_key in fields.items():
                    assert actual[output_key] == original[input_key]
                for output_key, input_key in [('price', 'Prix'), ('promo_price', 'PrixPromo'),
                                              ('quantity', 'Quantité')]:
                    assert actual[output_key] == (None if original[input_key] is None else str(original[input_key]))
                product_ids.append(actual['id'])
    assert len(set(product_ids)) == 93
    category_ids = {c['name']: c['id'] for c in catalog['categories']}
    assert all(i['category_id'] == category_ids[i['category']] for i in catalog['ingredients'])
    recipes = json.loads((ROOT / 'data/recipes/initial_recipes.json').read_text(encoding='utf-8'))
    assert recipes['ingredient_catalog'] == cli.OUTPUT.as_posix()
    assert all(i['ingredient_id'] in indexed for r in recipes['recipes'] for i in r['ingredients'])


@pytest.mark.parametrize('change', ['rename', 'duplicate', 'unmapped', 'extra_product_field'])
def test_changed_sources_fail_instead_of_silently_losing_or_misassigning_data(sources, change):
    path = sources / 'data/catalog/metro/produits.json'
    rows = json.loads(path.read_text(encoding='utf-8'))
    if change == 'rename':
        rows[0]['NomProduit'] = 'Autre ingrédient'
    elif change == 'duplicate':
        rows.append(rows[0])
    elif change == 'unmapped':
        rows.append({**rows[0], 'Id': 32})
    else:
        rows[0]['Produits'][0]['nouveau_champ'] = 'à conserver'
    path.write_text(json.dumps(rows), encoding='utf-8')
    with pytest.raises(ValueError):
        build_common_catalog(sources, cli.MAPPING)


def test_unknown_values_and_external_id_leading_zeroes_are_preserved(sources):
    path = sources / 'data/catalog/metro/produits.json'
    rows = json.loads(path.read_text(encoding='utf-8'))
    rows[0]['Produits'][0].update({'Id': '00123', 'Prix': None, 'Quantité': None,
                                 'Unité': None, 'DateDebut': None, 'IsPromotion': None})
    path.write_text(json.dumps(rows), encoding='utf-8')
    catalog = build_common_catalog(sources, cli.MAPPING)
    product = next(p for p in catalog['ingredients'][0]['products'] if p['retailer'] == 'metro')
    assert product['external_product_id'] == '00123'
    assert product['id'] == 'metro:178:00123'
    assert all(product[key] is None for key in ['price', 'quantity', 'unit', 'valid_from', 'is_promotion'])


def test_cli_regeneration_is_deterministic_and_does_not_overwrite_inputs(sources, monkeypatch):
    monkeypatch.setattr(cli, 'ROOT', sources)
    before = {p: p.read_bytes() for p in sources.rglob('*.json')}
    monkeypatch.setattr(sys, 'argv', ['build-common'])
    assert cli.main() == 0
    first = (sources / cli.OUTPUT).read_bytes()
    assert cli.main() == 0
    assert (sources / cli.OUTPUT).read_bytes() == first
    monkeypatch.setattr(sys, 'argv', ['build-common', '--output', 'data/catalog/metro/produits.json'])
    assert cli.main() == 1
    for path, content in before.items():
        assert path.read_bytes() == content