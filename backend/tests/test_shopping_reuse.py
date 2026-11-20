"""Modèles, copies privées, exclusions futures et historique immuable."""
from uuid import uuid4
import pytest
from pydantic import ValidationError
from sqlalchemy import select, text, delete, update, func
from backend.tests.test_shopping_list_storage import db, postgres, create, add  # noqa: F401
from backend.tests.test_accounts import ALICE, BOB
from backend.app.catalog.models import Ingredient
from backend.app.shopping_lists import reuse, service
from backend.app.shopping_lists.models import ShoppingListTemplate, ShoppingResourceCommand, ShoppingListExclusion, ShoppingList
from backend.app.shopping_lists.schemas import ShoppingCommand, ShoppingItemUpdate, ShoppingPossessionWrite, ShoppingManualPurchaseWrite
from backend.app.shopping_lists.reuse_schemas import (
    ShoppingDuplicateWrite, ShoppingTemplateCreate, ShoppingTemplateUpdate, ShoppingTemplateInstantiate,
    ShoppingExclusionWrite,
)


def model(db, source=None, key=None):
    source = source or add(db, create(db), ingredient_id='ing_test_riz', quantity={'amount': '1000', 'unit': 'g'})
    return reuse.create_template(db, ALICE, ShoppingTemplateCreate(source_list_id=source.id,
        source_revision=source.revision, name='Chaque semaine', icon='cart'), key or uuid4())


def instantiate(db, template, *, user=ALICE, key=None):
    return reuse.instantiate(db, template.id, user, ShoppingTemplateInstantiate(
        expected_template_revision=template.revision, name='Nouvelle semaine', purchase_date='2026-11-20'), key or uuid4())


def test_instantiate_active_template_keeps_only_needs_and_replays_once(db):
    template = model(db)
    body = ShoppingTemplateInstantiate(expected_template_revision=template.revision,
        name='Courses du modèle', purchase_date='2026-11-20', activate=True)
    key = uuid4()
    created = reuse.instantiate(db, template.id, ALICE, body, key)
    assert created.status == 'active' and len(created.items) == 1
    assert created.assignment is None and created.choices == []
    assert not created.purchases and not created.product_purchases and not created.items[0].owned
    assert reuse.instantiate(db, template.id, ALICE, body, key) == created


def test_copy_has_fresh_ids_zero_purchases_and_keeps_exact_corrected_needs(db):
    source = add(db, create(db), ingredient_id='ing_test_riz', quantity={'amount': '1000', 'unit': 'g'})
    item = source.items[0]
    source = service.set_possession(db, source.id, item.id, ALICE,
        ShoppingPossessionWrite(expected_revision=source.revision, coverage={'quantities': [{'amount': '200', 'unit': 'g'}]}), uuid4())
    source = service.set_manual_purchase(db, source.id, item.id, ALICE,
        ShoppingManualPurchaseWrite(expected_revision=source.revision, purchased=True, coverage={'quantities': [{'amount': '800', 'unit': 'g'}]}), uuid4())
    source = service.update_item(db, source.id, item.id, ALICE,
        ShoppingItemUpdate(expected_revision=source.revision, quantity={'amount': '1500', 'unit': 'g'}), uuid4())
    body = ShoppingDuplicateWrite(source_revision=source.revision, name='Copie', purchase_date='2026-11-21')
    key = uuid4()
    copied = reuse.duplicate(db, source.id, ALICE, body, key)
    assert copied.id != source.id and copied.items[0].id != item.id
    assert copied.items[0].required == source.items[0].required
    assert copied.items[0].contributions[0].id != source.items[0].contributions[0].id
    assert not copied.items[0].owned and not copied.purchases and not copied.product_purchases
    assert copied.assignment is None and copied.totals.budget_known_amount == '0'
    assert copied.status == 'draft' and copied.revision == 1 and copied.totals.remaining_item_count == 1
    assert copied.origin.id == source.id and copied.origin.revision == source.revision
    assert reuse.duplicate(db, source.id, ALICE, body, key) == copied
    assert service.get_list(db, source.id, ALICE) == source


def test_copy_and_model_reject_an_old_state_instead_of_restoring_a_saved_version(db):
    original = add(db, create(db), quantity={'amount': '250', 'unit': 'g'})
    changed = service.update_item(db, original.id, original.items[0].id, ALICE,
        ShoppingItemUpdate(expected_revision=original.revision, removed=True), uuid4())
    for action in [
        lambda: reuse.duplicate(db, original.id, ALICE,
            ShoppingDuplicateWrite(source_revision=original.revision, name='Ancien besoin', purchase_date='2026-11-21'), uuid4()),
        lambda: model(db, original),
    ]:
        with pytest.raises(service.ShoppingListError) as error:
            action()
        assert error.value.code == 'LIST_REVISION_CONFLICT'
    copied = reuse.duplicate(db, changed.id, ALICE,
        ShoppingDuplicateWrite(source_revision=changed.revision, name='Besoin actuel', purchase_date='2026-11-21'), uuid4())
    assert not copied.items
    assert service.get_list(db, original.id, ALICE) == changed


def test_template_edits_and_deletion_do_not_change_existing_instances(db):
    template = model(db)
    first = instantiate(db, template)
    items = [template.items[0].model_copy(update={'name': 'Riz modifié', 'required': []})]
    updated = reuse.change_template(db, template.id, ALICE,
        ShoppingTemplateUpdate(expected_revision=1, name='Autre modèle', icon='leaf', items=items), uuid4())
    assert updated.revision == 2
    assert service.get_list(db, first.id, ALICE) == first
    second = instantiate(db, updated)
    assert not second.items[0].required and second.items[0].name == 'Riz modifié'
    key = uuid4()
    body = ShoppingCommand(expected_revision=2)
    removed = reuse.change_template(db, template.id, ALICE, body, key, remove=True)
    assert removed.deleted
    assert reuse.change_template(db, template.id, ALICE, body, key, remove=True) == removed
    with pytest.raises(service.ShoppingListError):
        instantiate(db, updated)
    assert service.get_list(db, first.id, ALICE) == first
    assert reuse.list_templates(db, ALICE)[1] == 0


def test_template_creation_replay_and_revision_conflicts(db):
    source = add(db, create(db), name='Pain')
    key = uuid4()
    template = model(db, source, key)
    assert model(db, source, key) == template
    reuse.change_template(db, template.id, ALICE, ShoppingTemplateUpdate(expected_revision=1, name='Renommé'), uuid4())
    with pytest.raises(service.ShoppingListError) as error:
        instantiate(db, template)
    assert error.value.code == 'TEMPLATE_REVISION_CONFLICT'
    with pytest.raises(service.ShoppingListError) as error:
        reuse.change_template(db, template.id, ALICE, ShoppingTemplateUpdate(expected_revision=1, icon='home'), uuid4())
    assert error.value.error.current_revision == 2


def test_foreign_sources_templates_revisions_and_exclusions_are_private(db):
    source = add(db, create(db), name='Pain')
    template = model(db, source)
    for call in [lambda: reuse.get_template(db, template.id, BOB),
                 lambda: instantiate(db, template, user=BOB),
                 lambda: service.get_list(db, source.id, BOB),
                 lambda: reuse.duplicate(db, source.id, BOB, ShoppingDuplicateWrite(source_revision=source.revision, name='Vol', purchase_date='2026-11-20'), uuid4())]:
        with pytest.raises(service.ShoppingListError) as error:
            call()
        assert error.value.status == 404
    reuse.set_exclusion(db, 'ing_test_riz', ALICE, ShoppingExclusionWrite(excluded=True), uuid4())
    assert reuse.list_exclusions(db, BOB)[1] == 0
    assert reuse.list_templates(db, BOB)[1] == 0


def test_exclusions_do_not_remove_manual_items_or_template_contents(db):
    source = add(db, create(db), ingredient_id='ing_test_riz', quantity={'amount': '500', 'unit': 'g'})
    template = model(db, source)
    key = uuid4()
    body = ShoppingExclusionWrite(excluded=True)
    excluded = reuse.set_exclusion(db, 'ing_test_riz', ALICE, body, key)
    assert reuse.set_exclusion(db, 'ing_test_riz', ALICE, body, key) == excluded
    assert service.get_list(db, source.id, ALICE) == source
    assert len(instantiate(db, template).items) == 1
    assert len(add(db, create(db), ingredient_id='ing_test_riz').items) == 1
    reuse.set_exclusion(db, 'ing_test_riz', ALICE, ShoppingExclusionWrite(excluded=False), uuid4())
    assert reuse.list_exclusions(db, ALICE)[1] == 0


def test_idempotency_keys_are_unique_across_list_and_resource_commands(db):
    key = uuid4()
    create(db, key=key)
    with pytest.raises(service.ShoppingListError) as error:
        reuse.set_exclusion(db, 'ing_test_riz', ALICE, ShoppingExclusionWrite(excluded=True), key)
    assert error.value.code == 'IDEMPOTENCY_KEY_REUSED'
    key = uuid4()
    reuse.set_exclusion(db, 'ing_test_riz', ALICE, ShoppingExclusionWrite(excluded=True), key)
    with pytest.raises(service.ShoppingListError) as error:
        create(db, key=key)
    assert error.value.code == 'IDEMPOTENCY_KEY_REUSED'


def test_current_and_history_collections_are_disjoint(db):
    first, second = create(db), create(db)
    archived = service.change_status(db, first.id, ALICE, 'archive', ShoppingCommand(expected_revision=1), uuid4())
    assert [i.id for i in service.list_lists(db, ALICE, collection='current')[0]] == [second.id]
    assert [i.id for i in service.list_lists(db, ALICE, collection='history')[0]] == [first.id]
    service.change_status(db, first.id, ALICE, 'reopen', ShoppingCommand(expected_revision=archived.revision), uuid4())
    assert service.list_lists(db, ALICE, collection='history')[1] == 0


def test_missing_canonical_ingredient_is_kept_as_free_text_in_copy(db):
    source = add(db, create(db), ingredient_id='ing_test_riz')
    template = model(db, source)
    db.execute(delete(Ingredient).where(Ingredient.id == 'ing_test_riz'))
    db.commit()
    copied = instantiate(db, template)
    assert copied.items[0].ingredient_id is None
    assert any(w.code == 'COPY_INGREDIENT_UNAVAILABLE' for w in copied.warnings)


def test_reuse_tables_have_rls_and_account_deletion_cascades(db):
    template = model(db)
    reuse.set_exclusion(db, 'ing_test_riz', ALICE, ShoppingExclusionWrite(excluded=True), uuid4())
    for name in ('shopping_list_template', 'shopping_list_exclusion', 'shopping_resource_command'):
        assert db.scalar(text('SELECT relrowsecurity FROM pg_class WHERE oid=CAST(:name AS regclass)'), {'name': 'public.' + name})
        assert db.scalar(text('SELECT count(*) FROM pg_policies WHERE tablename=:name'), {'name': name}) == 0
    db.execute(text('DELETE FROM auth.users WHERE id=:id'), {'id': ALICE.id})
    db.commit()
    for table in (ShoppingListTemplate, ShoppingResourceCommand, ShoppingListExclusion):
        assert db.scalar(select(func.count()).select_from(table)) == 0


@pytest.mark.parametrize('body', [dict(expected_revision=1), dict(expected_revision=1, icon='random'),
    dict(expected_revision=True, name='Test'), dict(expected_revision=1, items=None), dict(expected_revision=1, owner_id=str(uuid4()))])
def test_template_contract_rejects_ambiguous_updates(body):
    with pytest.raises(ValidationError):
        ShoppingTemplateUpdate.model_validate(body)


def test_copy_drops_saved_prices_and_keeps_original_after_catalog_changes(db):
    from backend.tests.test_shopping_comparisons import prepared, simulate, apply, source
    from backend.tests.test_shopping_list_purchases import sale
    priced = prepared(db)
    loader = source(sale(500, 3, 'price'))
    saved = apply(db, priced, simulate(db, priced, loader), loader=loader)
    copied = reuse.duplicate(db, saved.id, ALICE, ShoppingDuplicateWrite(source_revision=saved.revision,
        name='Autre date', purchase_date='2026-11-24'), uuid4())
    assert copied.assignment is None and not copied.product_purchases
    assert not copied.totals.estimate_complete and copied.totals.budget_known_amount == '0'
    simulate(db, copied, source(sale(500, 9, 'price')))
    assert service.get_list(db, saved.id, ALICE) == saved
    assert service.get_list(db, saved.id, ALICE).assignment.scenario.known_amount == '6.00'


def test_saved_templates_drop_product_preferences_even_for_legacy_include_choices(db):
    from backend.tests.test_shopping_comparisons import prepared, simulate, source
    from backend.app.shopping_lists import comparisons
    from backend.app.shopping_lists.schemas import ShoppingChoiceWrite
    original = prepared(db)
    original = comparisons.choose(db, original.id, original.items[0].id, ALICE,
        ShoppingChoiceWrite(expected_revision=original.revision, product_id='maxi:8661:a'), uuid4(), source())
    template = reuse.create_template(db, ALICE, ShoppingTemplateCreate(source_list_id=original.id,
        source_revision=original.revision, name='Choix souhaités', include_choices=True), uuid4())
    assert template.kind == 'articles' and template.items[0].preferred_product_id is None
    no_choices = instantiate(db, template)
    assert not no_choices.choices
    saved = reuse.instantiate(db, template.id, ALICE, ShoppingTemplateInstantiate(expected_template_revision=1,
        name='Choix à vérifier', purchase_date='2026-11-14', include_choices=True), uuid4())
    assert saved.kind == 'articles' and not saved.choices
    assert saved.assignment is None and not any(w.code == 'COPY_PRODUCT_CHOICES' for w in saved.warnings)
    proposal = simulate(db, saved, lambda *_: [])
    assert proposal.scenarios[-1].needs[0].status == 'unpriced'
    assert not proposal.scenarios[-1].needs[0].lines


from backend.tests.test_shopping_list_calendar import database, concurrent_database, add_meal, preview, creation_request, RICE  # noqa: E402, F401


def test_calendar_exclusions_invalidate_preview_and_require_empty_confirmation(database):
    from sqlalchemy.orm import Session
    add_meal(database)
    before = preview(database)
    with Session(database) as session:
        reuse.set_exclusion(session, RICE, ALICE, ShoppingExclusionWrite(excluded=True), uuid4())
        with pytest.raises(service.ShoppingListError) as error:
            service.create_from_calendar(session, ALICE, creation_request(before), uuid4())
        assert error.value.code == 'CALENDAR_PREVIEW_STALE'
    excluded = preview(database)
    assert excluded.items == [] and excluded.excluded_ingredient_ids == [RICE]
    with Session(database) as session:
        with pytest.raises(service.ShoppingListError) as error:
            service.create_from_calendar(session, ALICE, creation_request(excluded), uuid4())
        assert error.value.code == 'EMPTY_LIST_CONFIRMATION_REQUIRED'
        created = service.create_from_calendar(session, ALICE, creation_request(excluded, accept_empty=True), uuid4())
        assert created.items == [] and any(w.code == 'CALENDAR_EXCLUSIONS' for w in created.warnings)
        reuse.set_exclusion(session, RICE, ALICE, ShoppingExclusionWrite(excluded=False), uuid4())
        assert service.get_list(session, created.id, ALICE) == created
    assert len(preview(database).items) == 1


def test_recipe_changes_do_not_rewrite_copied_calendar_provenance(database):
    from sqlalchemy.orm import Session
    from backend.app.recipes.models import Recipe, RecipeIngredient
    from backend.tests.test_shopping_list_calendar import RECIPE
    add_meal(database)
    result = preview(database)
    with Session(database) as session:
        original = service.create_from_calendar(session, ALICE, creation_request(result), uuid4())
        session.execute(update(Recipe).where(Recipe.id == RECIPE).values(name='Recette changée'))
        session.execute(update(RecipeIngredient).where(RecipeIngredient.recipe_id == RECIPE).values(quantity=999))
        session.commit()
        copied = reuse.duplicate(session, original.id, ALICE, ShoppingDuplicateWrite(source_revision=original.revision,
            name='Ancienne recette', purchase_date='2026-11-23'), uuid4())
        assert copied.items[0].contributions[0].recipe_name == original.items[0].contributions[0].recipe_name
        assert copied.items[0].required == original.items[0].required
        assert service.get_list(session, original.id, ALICE) == original


@pytest.mark.parametrize('same_key', [False, True])
def test_concurrent_template_creation_is_idempotent(concurrent_database, same_key):
    from sqlalchemy.orm import Session
    from threading import Barrier
    from concurrent.futures import ThreadPoolExecutor
    engine = concurrent_database
    with Session(engine) as session:
        source = create(session)
    body = ShoppingTemplateCreate(source_list_id=source.id, source_revision=source.revision, name='Concurrent')
    key = uuid4()
    barrier = Barrier(2)
    def run(token):
        with Session(engine) as session:
            barrier.wait(timeout=5)
            return reuse.create_template(session, ALICE, body, token)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, [key, key if same_key else uuid4()]))
    assert (results[0].id == results[1].id) == same_key
    with Session(engine) as session:
        assert reuse.list_templates(session, ALICE)[1] == (1 if same_key else 2)


def test_failed_copy_does_not_write_list_command_or_revision(db, monkeypatch):
    original = add(db, create(db), name='Pain')
    before = service.list_lists(db, ALICE)[1]
    monkeypatch.setattr(service, '_snapshot', lambda *a: (_ for _ in ()).throw(RuntimeError('Interruption')))
    with pytest.raises(RuntimeError):
        reuse.duplicate(db, original.id, ALICE, ShoppingDuplicateWrite(source_revision=original.revision,
            name='Copie interrompue', purchase_date='2026-11-20'), uuid4())
    assert service.list_lists(db, ALICE)[1] == before


def test_concurrent_template_updates_cannot_overwrite_same_revision(concurrent_database):
    from sqlalchemy.orm import Session
    from threading import Barrier
    from concurrent.futures import ThreadPoolExecutor
    engine = concurrent_database
    with Session(engine) as session:
        template = model(session, create(session))
    barrier = Barrier(2)
    def run(name):
        with Session(engine) as session:
            barrier.wait(timeout=5)
            try:
                return reuse.change_template(session, template.id, ALICE,
                    ShoppingTemplateUpdate(expected_revision=1, name=name), uuid4())
            except service.ShoppingListError as error:
                return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, ['Premier', 'Second']))
    assert sum(value == 'TEMPLATE_REVISION_CONFLICT' for value in results if isinstance(value, str)) == 1
    with Session(engine) as session:
        assert reuse.get_template(session, template.id, ALICE).revision == 2


@pytest.mark.parametrize('legacy_kind', [None, 'products'])
def test_existing_saved_products_are_presented_and_instantiated_as_articles(db, legacy_kind):
    original = model(db)
    raw = [item.model_dump(mode='json') for item in original.items]
    raw[0].update(name='Riz commercial sac 1 kg', preferred_product_id='maxi:old:rice')
    db.execute(update(ShoppingListTemplate).where(ShoppingListTemplate.id == original.id).values(kind=legacy_kind, items=raw))
    db.commit()
    projected = reuse.get_template(db, original.id, ALICE)
    assert projected.kind == 'articles' and projected.items[0].name == 'Riz'
    assert projected.items[0].preferred_product_id is None
    assert projected.items[0].id == original.items[0].id and projected.items[0].required == original.items[0].required
    assert reuse.list_templates(db, ALICE)[0][0] == projected
    assert db.scalar(select(ShoppingListTemplate.revision)) == original.revision
    assert db.scalar(select(ShoppingListTemplate.kind)) == legacy_kind  # lecture sans écriture cachée
    copied = instantiate(db, projected)
    assert copied.kind == 'articles' and not copied.choices and copied.assignment is None
    assert copied.items[0].name == 'Riz'
    updated = reuse.change_template(db, original.id, ALICE, ShoppingTemplateUpdate(expected_revision=original.revision, name='Nouveau nom'), uuid4())
    assert updated.kind == 'articles'
    assert db.scalar(select(ShoppingListTemplate.kind)) == 'articles'
    assert db.scalar(select(ShoppingListTemplate.items))[0]['preferred_product_id'] is None


def test_old_product_template_command_replay_is_projected_without_creating_another_resource(db):
    original = add(db, create(db), ingredient_id='ing_test_riz')
    key = uuid4()
    saved = model(db, original, key)
    previous = saved.model_dump(mode='json')
    previous['kind'] = 'products'
    previous['items'][0].update(name='Riz marque commerciale', preferred_product_id='maxi:old:rice')
    db.execute(update(ShoppingResourceCommand).where(ShoppingResourceCommand.idempotency_key == key).values(result=previous))
    db.commit()
    replay = model(db, original, key)
    assert replay.id == saved.id and replay.kind == 'articles'
    assert replay.items[0].name == 'Riz' and replay.items[0].preferred_product_id is None
    assert db.scalar(select(func.count()).select_from(ShoppingListTemplate)) == 1
