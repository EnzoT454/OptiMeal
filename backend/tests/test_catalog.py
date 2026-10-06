"""Formats, codes-barres et correspondances du catalogue, sans réseau."""
from decimal import Decimal

import pytest

from backend.app.catalog.formats import parse_format, validated_barcode
from backend.app.catalog.matching import match_name
from backend.app.catalog.schemas import Ingredient
from backend.cli.ingest_catalog import CONFIG, read_json


@pytest.mark.parametrize('raw,quantity,unit', [
    ('3 lb', '1360.77711', 'g'), ('2 x 125 g', '250', 'g'),
    ('1,5 L', '1500', 'ml'), ('12 unités', '12', 'unit'),
])
def test_formats(raw, quantity, unit):
    result = parse_format(raw)
    assert result.quantity == Decimal(quantity)
    assert result.unit == unit


@pytest.mark.parametrize('raw', [None, '300–454 g', '2 pour 5 $', '0 g', '0 x 125 g', 'gousse'])
def test_unknown_formats_do_not_invent_quantities(raw):
    assert parse_format(raw).quantity is None


def test_variable_weight_is_not_a_package():
    result = parse_format('vendu au poids')
    assert result.kind == 'variable_weight'
    assert result.quantity is None


@pytest.mark.parametrize('ingredient,name,status', [
    ('ing_ail_frais', 'Ail biologique', 'suggested'),
    ('ing_ail_frais', "Beurre à l’ail", 'rejected'),
    ('ing_ail_frais', "Poudre d’ail", 'rejected'),
    ('ing_oignon_jaune', 'Oignons verts', 'rejected'),
    ('ing_oignon_jaune', 'Oignons jaunes 3 lb', 'suggested'),
    ('ing_lait_2', 'Lait 2 %', 'suggested'),
    ('ing_lait_2', 'Lait 3,25 %', 'rejected'),
    ('ing_riz_basmati_blanc', 'Riz basmati brun', 'rejected'),
    ('ing_huile_olive', "Huile d’olive extra vierge", 'suggested'),
    ('ing_oeuf_gros', 'Œufs gros', 'suggested'),
])
def test_matching_preserves_distinctions(ingredient, name, status):
    ingredients = {i['id']: Ingredient.model_validate(i) for i in read_json(CONFIG / 'ingredients.json')['ingredients']}
    actual, reasons = match_name(ingredients[ingredient], name)
    assert actual == status
    assert reasons


@pytest.mark.parametrize('raw,expected', [('036000291452', '036000291452'),
                                        ('0 36000291452', '036000291452'),
                                        ('036000291453', None), ('4131', None),
                                        (36000291452, None), (None, None)])
def test_barcode_validation_preserves_leading_zero(raw, expected):
    assert validated_barcode(raw) == expected
