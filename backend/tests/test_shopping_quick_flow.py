"""Ajout générique, produit explicite et application d’un devis sans choix implicite."""
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from backend.app.catalog.models import Ingredient
from backend.app.catalog.sales import normalize_sale
from backend.app.shopping_lists import service, recalculation
from backend.app.shopping_lists.errors import ShoppingListError
from backend.app.shopping_lists.models import ShoppingListItem, ShoppingListComparison
from backend.app.shopping_lists.schemas import ShoppingItemAdd, ShoppingListCreate, ShoppingRecalculatePricesWrite, ShoppingChoiceWrite
from backend.tests.test_shopping_list_storage import db, postgres  # noqa: F401
from backend.tests.test_accounts import ALICE, BOB
from backend.tests.test_shopping_creation_pricing import sale, INGREDIENT, DAY
from backend.tests.test_sale_normalization import product


def empty(db):
    return service.create_list(db, ALICE, ShoppingListCreate(name='Mes courses', activate=True, purchase_date=DAY), uuid4())


def add(db, resource, ingredient=INGREDIENT, **changes):
    return service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Article', ingredient_id=ingredient, **changes), uuid4(), lambda *_: pytest.fail('Pas de prix implicite'))


def test_generic_ingredient_and_free_text_stay_unpriced_without_catalog_access(db):
    resource = add(db, empty(db))
    resource = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Texte inexistant', merge='separate'), uuid4())
    assert resource.items[1].ingredient_id is None
    assert resource.assignment is None and resource.choices == []
    assert resource.totals.budget_known_amount == '0'
    assert all(item.pricing_status == 'unpriced' for item in resource.items)


def test_explicit_product_add_is_atomic_and_does_not_price_other_ingredients(db):
    resource = empty(db)
    other = 'ing_lait_test'
    db.add(Ingredient(id=other, name='Lait test', category='Autres', aliases=[]))
    db.commit()
    resource = add(db, resource, other)
    sales = [sale(), normalize_sale(other, product(external_product_id='other'), DAY)]
    body = ShoppingItemAdd(expected_revision=resource.revision, name='Riz', ingredient_id=INGREDIENT,
        product_id=sales[0].product_id)
    key = uuid4()
    result = service.add_item(db, resource.id, ALICE, body, key, lambda *_: sales)
    assert result.totals.budget_known_amount == '3.00' and not result.totals.estimate_complete
    assert result.totals.unpriced_item_count == 1
    assert result.choices[0].product_id == sales[0].product_id
    assert not result.assignment.stale
    assert service.add_item(db, resource.id, ALICE, body, key, lambda *_: pytest.fail('Rejeu sans prix')) == result
    assert db.scalar(select(func.count()).select_from(ShoppingListItem)) == 2


def test_unpriced_explicit_product_keeps_its_identity_and_never_invents_amount(db):
    resource = empty(db)
    selected = sale(price=None)
    result = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Riz', ingredient_id=INGREDIENT, product_id=selected.product_id), uuid4(), lambda *_: [selected])
    assert result.choices[0].product_id == selected.product_id
    assert result.assignment.selected_products[selected.product_id].price is None
    assert result.assignment.scenario.needs[0].status == 'manual_unavailable'
    assert not result.totals.estimate_complete and result.totals.budget_known_amount == '0.00'


def test_invalid_product_rolls_back_the_added_article(db):
    resource = empty(db)
    with pytest.raises(ShoppingListError):
        service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
            name='Riz', ingredient_id=INGREDIENT, product_id='missing'), uuid4(), lambda *_: [sale()])
    assert service.get_list(db, resource.id, ALICE) == resource


def test_comparison_reads_nothing_persistent_and_requires_unchanged_quote(db):
    resource = add(db, empty(db))
    source = lambda *_: [sale()]
    quote = recalculation.options(db, resource.id, ALICE, source)
    assert service.get_list(db, resource.id, ALICE) == resource
    assert db.scalar(select(func.count()).select_from(ShoppingListComparison)) == 0
    body = ShoppingRecalculatePricesWrite(expected_revision=resource.revision, scenario='cheapest', expected_fingerprint=quote.fingerprint)
    with pytest.raises(ShoppingListError) as failure:
        recalculation.recalculate(db, resource.id, ALICE, body, uuid4(), lambda *_: [sale(price='4')])
    assert failure.value.code == 'COMPARISON_STALE'
    assert service.get_list(db, resource.id, ALICE) == resource
    result = recalculation.recalculate(db, resource.id, ALICE, body, uuid4(), source)
    assert result.totals.budget_known_amount == '3.00'


def test_partial_comparison_requires_confirmation_and_other_account_is_denied(db):
    resource = add(db, empty(db), ingredient=None)
    source = lambda *_: [sale()]
    quote = recalculation.options(db, resource.id, ALICE, source)
    body = ShoppingRecalculatePricesWrite(expected_revision=resource.revision, expected_fingerprint=quote.fingerprint)
    with pytest.raises(ShoppingListError) as failure:
        recalculation.recalculate(db, resource.id, ALICE, body, uuid4(), source)
    assert failure.value.code == 'COMPARISON_PARTIAL'
    assert service.get_list(db, resource.id, ALICE).assignment is None
    with pytest.raises(ShoppingListError) as failure:
        recalculation.options(db, resource.id, BOB, source)
    assert failure.value.status == 404


def test_targeted_choice_keeps_already_purchased_prices_and_other_generic_needs(db):
    from backend.tests.test_shopping_recalculation import make, buy
    bought = buy(db, make(db), 1)
    paid = bought.product_purchases[0].model_dump(mode='json')
    resource = service.add_item(db, bought.id, ALICE, ShoppingItemAdd(expected_revision=bought.revision,
        name='Sacs libres'), uuid4())
    other = sale(retailer='metro', identity='other', price='4')
    request = ShoppingChoiceWrite(expected_revision=resource.revision, product_id=other.product_id)
    key = uuid4()
    result = recalculation.select_product(db, resource.id, resource.items[0].id, ALICE, request, key, lambda *_: [sale(), other])
    assert result.product_purchases[0].model_dump(mode='json') == paid
    assert result.totals.budget_known_amount == '7.00'
    assert not result.totals.estimate_complete
    assert result.assignment.scenario.needs[-1].status == 'unpriced'
    assert recalculation.select_product(db, resource.id, resource.items[0].id, ALICE, request, key,
        lambda *_: pytest.fail('Aucun recalcul au rejeu')) == result


@pytest.mark.parametrize('kind', ['articles', 'products'])
def test_typed_empty_list_kind_is_persisted_and_replayed(db, kind):
    body = ShoppingListCreate(name='Liste typée', kind=kind, activate=True)
    key = uuid4()
    resource = service.create_list(db, ALICE, body, key)
    assert resource.kind == kind
    assert service.get_list(db, resource.id, ALICE).kind == kind
    assert service.create_list(db, ALICE, body, key) == resource


def test_articles_list_rejects_product_add_and_price_application_atomically(db):
    resource = service.create_list(db, ALICE, ShoppingListCreate(name='Articles', kind='articles'), uuid4())
    resource = add(db, resource)
    original = resource
    with pytest.raises(ShoppingListError, match='mélangées') as failure:
        service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
            name='Produit', ingredient_id=INGREDIENT, product_id=sale().product_id), uuid4(), lambda *_: [sale()])
    assert failure.value.code == 'LIST_KIND_CONFLICT'
    assert service.get_list(db, resource.id, ALICE) == original
    with pytest.raises(ShoppingListError) as failure:
        recalculation.recalculate(db, resource.id, ALICE, ShoppingRecalculatePricesWrite(
            expected_revision=resource.revision), uuid4(), lambda *_: [sale()])
    assert failure.value.code == 'LIST_KIND_CONFLICT'
    assert service.get_list(db, resource.id, ALICE) == original


def test_products_list_requires_an_explicit_product_for_every_item(db):
    resource = service.create_list(db, ALICE, ShoppingListCreate(name='Produits', kind='products'), uuid4())
    for ingredient in [None, INGREDIENT]:
        with pytest.raises(ShoppingListError) as failure:
            add(db, resource, ingredient=ingredient)
        assert failure.value.code == 'LIST_KIND_CONFLICT'
        assert service.get_list(db, resource.id, ALICE) == resource
    selected = sale(price=None)
    resource = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Produit sans prix', ingredient_id=INGREDIENT, product_id=selected.product_id), uuid4(), lambda *_: [selected])
    assert resource.kind == 'products' and len(resource.choices) == 1
    assert resource.totals.unpriced_item_count == 1
    with pytest.raises(ShoppingListError) as failure:
        recalculation.recalculate(db, resource.id, ALICE, ShoppingRecalculatePricesWrite(expected_revision=resource.revision,
            choices=[{'item_id': resource.items[0].id, 'product_id': None}]), uuid4(), lambda *_: [sale()])
    assert failure.value.code == 'LIST_KIND_CONFLICT'
    assert service.get_list(db, resource.id, ALICE) == resource


def test_product_refresh_uses_today_preserves_choice_and_purchase_price(db, monkeypatch):
    from backend.app.shopping_lists.schemas import ShoppingProductPurchaseWrite
    from backend.app.shopping_lists.courses import set_product_purchase
    resource = service.create_list(db, ALICE, ShoppingListCreate(name='Produits', kind='products', purchase_date=DAY), uuid4())
    original_sale = sale()
    resource = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Riz', ingredient_id=INGREDIENT, product_id=original_sale.product_id), uuid4(), lambda *_: [original_sale])
    # Le même scénario conserve les instantanés achetés lors de l’actualisation.
    resource = set_product_purchase(db, resource.id, ALICE, ShoppingProductPurchaseWrite(expected_revision=resource.revision,
        comparison_id=resource.assignment.comparison_id, item_id=resource.items[0].id,
        product_id=original_sale.product_id, purchased_units=1), uuid4())
    saved = resource.product_purchases
    from datetime import timedelta
    day = DAY + timedelta(days=5)
    monkeypatch.setattr(service, 'today', lambda: day)
    days = []
    def source(session, on_date):
        days.append(on_date)
        return [sale(price='8')]
    body = ShoppingRecalculatePricesWrite(expected_revision=resource.revision, refresh_date=True)
    key = uuid4()
    refreshed = recalculation.recalculate(db, resource.id, ALICE, body, key, source)
    assert days == [day] and refreshed.purchase_date == day
    assert refreshed.product_purchases == saved and refreshed.choices == resource.choices
    assert recalculation.recalculate(db, resource.id, ALICE, body, key, lambda *_: pytest.fail('Rejeu')) == refreshed


def test_saving_products_converts_them_to_ingredients_without_changing_the_source(db):
    from backend.app.shopping_lists import reuse
    from backend.app.shopping_lists.reuse_schemas import ShoppingTemplateCreate, ShoppingTemplateInstantiate
    resource = service.create_list(db, ALICE, ShoppingListCreate(name='Produits', kind='products'), uuid4())
    resource = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Riz commercial grand sac', ingredient_id=INGREDIENT, product_id=sale().product_id), uuid4(), lambda *_: [sale()])
    template = reuse.create_template(db, ALICE, ShoppingTemplateCreate(source_list_id=resource.id,
        source_revision=resource.revision, name='Sauvegarde'), uuid4())
    assert template.kind == 'articles' and template.items[0].preferred_product_id is None
    assert template.items[0].name == 'Riz'
    assert service.get_list(db, resource.id, ALICE) == resource
    copy = reuse.instantiate(db, template.id, ALICE, ShoppingTemplateInstantiate(expected_template_revision=template.revision,
        name='Copie', purchase_date=DAY, activate=True), uuid4())
    assert copy.kind == 'articles' and copy.choices == []
    assert copy.items[0].name == 'Riz'
    assert copy.assignment is None and copy.product_purchases == []
    assert copy.items[0].owned == []


@pytest.mark.parametrize('kind', ['products', 'articles'])
def test_product_names_cannot_be_renamed_but_article_names_can(db, kind):
    from backend.app.shopping_lists.schemas import ShoppingItemUpdate
    resource = service.create_list(db, ALICE, ShoppingListCreate(name='Courses', kind=kind), uuid4())
    resource = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Riz', ingredient_id=INGREDIENT, **({'product_id': sale().product_id} if kind == 'products' else {})),
        uuid4(), lambda *_: [sale()])
    body = ShoppingItemUpdate(expected_revision=resource.revision, name='Nom personnalisé')
    if kind == 'products':
        with pytest.raises(ShoppingListError) as failure:
            service.update_item(db, resource.id, resource.items[0].id, ALICE, body, uuid4())
        assert failure.value.code == 'PRODUCT_NAME_IMMUTABLE'
        assert service.get_list(db, resource.id, ALICE) == resource
        result = service.update_item(db, resource.id, resource.items[0].id, ALICE,
            ShoppingItemUpdate(expected_revision=resource.revision, removed=True), uuid4())
        assert result.items[0].removed
        assert result.choices == resource.choices
    else:
        result = service.update_item(db, resource.id, resource.items[0].id, ALICE, body, uuid4())
        assert result.items[0].name == 'Nom personnalisé'


@pytest.mark.parametrize('kind', ['products', None])
@pytest.mark.parametrize('size,unit', [('500', 'g'), ('3', 'unit')])
def test_product_count_is_sale_packages_and_recalculated_atomically(db, size, unit, kind):
    from backend.app.shopping_lists.schemas import ShoppingItemUpdate
    selected = sale(size=size, unit=unit)
    resource = service.create_list(db, ALICE, ShoppingListCreate(name='Produits', kind=kind), uuid4())
    resource = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Riz', ingredient_id=INGREDIENT, product_id=selected.product_id), uuid4(), lambda *_: [selected])
    body = ShoppingItemUpdate(expected_revision=resource.revision, product_units=2, refresh_prices=True)
    key = uuid4()
    changed = service.update_item(db, resource.id, resource.items[0].id, ALICE, body, key, lambda *_: [selected])
    assert changed.revision == resource.revision + 1
    assert not changed.assignment.stale
    assert changed.assignment.scenario.needs[0].lines[0].sale_units == 2
    assert changed.totals.budget_known_amount == '6.00'
    assert changed.items[0].required[0].unit == unit
    assert changed.items[0].required[0].amount == str(int(size) * 2)
    assert changed.choices == resource.choices
    assert service.update_item(db, resource.id, resource.items[0].id, ALICE, body, key,
        lambda *_: pytest.fail('Aucun recalcul au rejeu')) == changed


@pytest.mark.parametrize('kind', ['products', None])
def test_remove_product_refreshes_remaining_prices_and_preserves_purchases(db, kind):
    from backend.app.shopping_lists.schemas import ShoppingItemUpdate, ShoppingProductPurchaseWrite
    from backend.app.shopping_lists.courses import set_product_purchase
    selected = sale()
    other = 'ing_lait_retrait'
    db.add(Ingredient(id=other, name='Lait', category='Autres', aliases=[])); db.commit()
    milk = normalize_sale(other, product(external_product_id='milk', price='2'), DAY)
    resource = service.create_list(db, ALICE, ShoppingListCreate(name='Produits', kind=kind), uuid4())
    for ingredient, choice in [(INGREDIENT, selected), (other, milk)]:
        resource = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
            name='Produit', ingredient_id=ingredient, product_id=choice.product_id), uuid4(), lambda *_: [selected, milk])
    rice = resource.items[0]
    resource = set_product_purchase(db, resource.id, ALICE, ShoppingProductPurchaseWrite(expected_revision=resource.revision,
        comparison_id=resource.assignment.comparison_id, item_id=rice.id, product_id=selected.product_id, purchased_units=1), uuid4())
    saved = resource.product_purchases
    body = ShoppingItemUpdate(expected_revision=resource.revision, removed=True, refresh_prices=True)
    changed = service.update_item(db, resource.id, rice.id, ALICE, body, uuid4(), lambda *_: [selected, milk])
    assert changed.items[0].removed and not changed.assignment.stale
    assert changed.product_purchases == saved and changed.choices == resource.choices
    assert changed.assignment.scenario.needs[0].item_ids == [resource.items[1].id]
    assert changed.totals.budget_known_amount == '5.00'  # achat historique de 3 + lait restant de 2
    assert not any(w.code == 'COMPARISON_STALE' for w in changed.warnings)


def test_failed_automatic_refresh_rolls_back_removal_and_is_retryable(db):
    from backend.app.shopping_lists.schemas import ShoppingItemUpdate
    resource = service.create_list(db, ALICE, ShoppingListCreate(name='Produits', kind='products'), uuid4())
    resource = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Riz', ingredient_id=INGREDIENT, product_id=sale().product_id), uuid4(), lambda *_: [sale()])
    body = ShoppingItemUpdate(expected_revision=resource.revision, removed=True, refresh_prices=True)
    key = uuid4()
    def unavailable(*_):
        raise ShoppingListError(503, 'CATALOG_UNAVAILABLE', 'Indisponible')
    with pytest.raises(ShoppingListError):
        service.update_item(db, resource.id, resource.items[0].id, ALICE, body, key, unavailable)
    assert service.get_list(db, resource.id, ALICE) == resource
    changed = service.update_item(db, resource.id, resource.items[0].id, ALICE, body, key, lambda *_: [sale()])
    assert changed.items[0].removed and not changed.assignment.stale


@pytest.mark.parametrize('count', [0, -1, 1.5, True, '2', 1_000_001])
def test_product_count_rejects_non_positive_non_integer_and_excessive_values(count):
    from pydantic import ValidationError
    from backend.app.shopping_lists.schemas import ShoppingItemUpdate
    with pytest.raises(ValidationError):
        ShoppingItemUpdate(expected_revision=1, product_units=count)


def test_product_count_keeps_paid_price_and_deducts_existing_package(db):
    from backend.app.shopping_lists.schemas import ShoppingItemUpdate, ShoppingProductPurchaseWrite
    from backend.app.shopping_lists.courses import set_product_purchase
    selected = sale()
    resource = service.create_list(db, ALICE, ShoppingListCreate(name='Produits', kind='products'), uuid4())
    resource = service.add_item(db, resource.id, ALICE, ShoppingItemAdd(expected_revision=resource.revision,
        name='Riz', ingredient_id=INGREDIENT, product_id=selected.product_id), uuid4(), lambda *_: [selected])
    resource = set_product_purchase(db, resource.id, ALICE, ShoppingProductPurchaseWrite(expected_revision=resource.revision,
        comparison_id=resource.assignment.comparison_id, item_id=resource.items[0].id,
        product_id=selected.product_id, purchased_units=1), uuid4())
    saved = resource.product_purchases
    changed = service.update_item(db, resource.id, resource.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=resource.revision, product_units=3), uuid4(), lambda *_: [sale(price='4')])
    assert changed.product_purchases == saved and not changed.assignment.stale
    assert changed.assignment.scenario.needs[0].lines[0].sale_units == 2
    assert changed.totals.budget_known_amount == '11.00'  # 3 déjà payé + 2 nouveaux paquets à 4
