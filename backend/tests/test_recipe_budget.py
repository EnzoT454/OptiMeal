"""Coûts internes au prorata et classement actualisé depuis PostgreSQL."""
from datetime import date
from decimal import Decimal
from fractions import Fraction

import pytest
from sqlalchemy import insert, update

from backend.app.catalog.common_schemas import SourceProduct
from backend.app.catalog.models import ProductOffer
from backend.app.recipes.budget import ingredient_cost
from backend.app.recipes.models import RecipeIngredient
from backend.tests.test_accounts import accounts, body  # noqa: F401
from backend.tests.test_ingredient_import import postgres  # noqa: F401
from backend.tests.test_recipe_sorting import add_recipe

DAY = date(2026, 11, 20)


def product(**changes):
    return SourceProduct(**{
        'id': 'maxi:test:rice', 'retailer': 'maxi', 'store_id': 'test',
        'external_product_id': 'rice', 'name': 'Produit test', 'price': '5',
        'currency': 'CAD', 'unit': 'g', 'quantity': '1000',
        'valid_from': None, 'valid_to': None, 'is_promotion': False,
        'source': 'test', 'url': None, **changes,
    })


@pytest.mark.parametrize('quantity,unit,changes,expected', [
    ('100', 'g', {}, Fraction(1, 2)),
    ('1500', 'g', {}, Fraction(15, 2)),  # pas deux sacs à 5 $
    ('1', 'kg', {}, Fraction(5)),
    ('0.5', 'cup', {'unit': 'L', 'quantity': '1', 'price': '4'}, Fraction(1, 2)),
    ('1', 'tbsp', {'unit': 'ml', 'quantity': '100', 'price': '2'}, Fraction(3, 10)),
    ('1', 'tsp', {'unit': 'ml', 'quantity': '100', 'price': '2'}, Fraction(1, 10)),
    ('3', 'unit', {'unit': 'unit', 'quantity': '12', 'price': '6'}, Fraction(3, 2)),
    ('100', 'ml', {}, None),
    ('1', 'unit', {}, None),
    ('100', 'g', {'quantity': None, 'unit': 'poids variable'}, None),
    ('100', 'g', {'price': None}, None),
    ('100', 'g', {'price': '0'}, Fraction(0)),
])
def test_cost_is_consumed_quantity_with_certain_conversions(quantity, unit, changes, expected):
    assert ingredient_cost(Decimal(quantity), unit, product(**changes), DAY) == expected


def test_promotion_validity_and_quantity_limit():
    offer = product(is_promotion=True, promo_price='3', quantity_limit=1, price_after_limit='6',
                    valid_from='2026-11-19', valid_to='2026-11-25')
    assert ingredient_cost(Decimal('1500'), 'g', offer, DAY) == 6
    assert ingredient_cost(Decimal('100'), 'g', offer, DAY) == Fraction(3, 10)
    for day in (date(2026, 11, 18), date(2026, 11, 26)):
        assert ingredient_cost(Decimal('1500'), 'g', offer, day) == Fraction(15, 2)
    missing = offer.model_copy(update={'price': None})
    assert ingredient_cost(Decimal('1500'), 'g', missing, date(2026, 11, 26)) is None


def add_offer(connection, ingredient_id, **changes):
    source = product(**changes)
    connection.execute(insert(ProductOffer).values(
        **source.model_dump(), ingredient_id=ingredient_id, position=1))


def add_budget_recipe(connection, recipe_id, ingredients):
    add_recipe(connection, recipe_id, name='Budget test', servings=4)
    if ingredients:
        connection.execute(insert(RecipeIngredient), [dict(recipe_id=recipe_id, ingredient_id=ingredient_id,
            quantity=Decimal(quantity), unit=unit, position=index)
            for index, (ingredient_id, quantity, unit) in enumerate(ingredients, 1)])


def test_global_order_partial_unknown_zero_and_database_price_updates(accounts, postgres):
    client, app = accounts
    # Identifiants existants du référentiel initial ; aucun prix JSON utilisé.
    first, second = [row['ingredient_id'] for row in body()['ingredients'][:2]]
    add_offer(postgres, first)
    add_offer(postgres, first, id='metro:test:rice', retailer='metro', price='4')
    add_offer(postgres, second, id='superc:test:rice', retailer='superc', price='10')
    add_budget_recipe(postgres, 'recipe_budget_a', [(first, '1000', 'g')])  # 4
    add_budget_recipe(postgres, 'recipe_budget_b', [(second, '500', 'g')])  # 5
    add_budget_recipe(postgres, 'recipe_budget_partial', [(first, '100', 'g'), (second, '1', 'unit')])  # 0.4
    add_budget_recipe(postgres, 'recipe_budget_unknown', [(first, '1', 'unit')])
    add_budget_recipe(postgres, 'recipe_budget_empty', [])
    url = '/api/v1/recipes?sort=budget&q=Budget test'
    def ids(suffix=''):
        response = client.get(url + suffix)
        assert response.status_code == 200, response.text
        assert 'estimated_cost' not in response.text
        return [row['id'] for row in response.json()['items']]
    expected = ['recipe_budget_partial', 'recipe_budget_a', 'recipe_budget_b',
                'recipe_budget_empty', 'recipe_budget_unknown']
    assert ids() == expected
    assert ids('&limit=2') + ids('&limit=2&offset=2') + ids('&limit=2&offset=4') == expected
    assert client.get(url).json()['total'] == 5
    # Nouvelle valeur en base : classement suivant changé sans cache/redémarrage.
    postgres.execute(update(ProductOffer).where(ProductOffer.ingredient_id == first).values(price=100))
    assert ids()[:3] == ['recipe_budget_b', 'recipe_budget_partial', 'recipe_budget_a']
    postgres.execute(update(ProductOffer).where(ProductOffer.ingredient_id == first).values(price=0))
    assert ids()[:3] == ['recipe_budget_a', 'recipe_budget_partial', 'recipe_budget_b']


def test_budget_without_database_offers_keeps_recipes_and_stable_pagination(accounts):
    client, app = accounts
    first = client.get('/api/v1/recipes?sort=budget&limit=4').json()
    rest = client.get('/api/v1/recipes?sort=budget&offset=4').json()
    assert first['total'] == rest['total'] == 10
    ids = [row['id'] for row in first['items'] + rest['items']]
    assert ids == sorted(ids)
