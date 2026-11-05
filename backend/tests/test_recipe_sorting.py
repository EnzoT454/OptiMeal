"""Classement global avant pagination, dates honnêtes et droits conservés."""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from alembic import command
import pytest
from sqlalchemy import insert, select, text, update

from backend.app.accounts.models import Profile
from backend.app.recipes.models import Recipe, RecipeRating
from backend.app.recipes.ratings import ranking_score
from backend.tests.test_accounts import ALICE, BOB, accounts, body, login  # noqa: F401
from backend.tests.test_ingredient_import import postgres, alembic_config  # noqa: F401


def add_recipe(connection, recipe_id, **changes):
    values = body()
    values.pop('ingredients')
    connection.execute(insert(Recipe).values(**{
        **values, 'id': recipe_id, 'seed_key': recipe_id.removeprefix('recipe_'),
        'owner_id': None, 'visibility': 'public', **changes,
    }))


def add_voters(connection, count):
    ids = [UUID(int=1000 + i) for i in range(count)]
    connection.execute(text('INSERT INTO auth.users(id) VALUES (:id)'), [{'id': value} for value in ids])
    connection.execute(insert(Profile), [{'id': value} for value in ids])
    return ids


def add_votes(connection, recipe_id, voters, scores):
    connection.execute(insert(RecipeRating), [
        dict(recipe_id=recipe_id, user_id=user, taste_score=score, reliability_score=score, ease_score=score)
        for user, score in zip(voters, scores)
    ])


def test_adjusted_sort_matches_reference_and_puts_unrated_last(accounts, postgres):
    client, app = accounts
    voters = add_voters(postgres, 100)
    examples = [('recipe_sort_omelette', [5] * 2), ('recipe_sort_curry', [5] * 70 + [4] * 30),
                ('recipe_sort_pates', [5] * 30 + [4] * 20), ('recipe_sort_salade', [5] * 4 + [4])]
    for recipe_id, scores in examples:
        add_recipe(postgres, recipe_id)
        add_votes(postgres, recipe_id, voters, scores)
    result = client.get('/api/v1/recipes?scope=discover&sort=top&limit=100').json()
    expected = sorted(examples, key=lambda entry: ranking_score(
        Decimal(sum(entry[1])) / len(entry[1]), len(entry[1])), reverse=True)
    assert [row['id'] for row in result['items'][:4]] == [entry[0] for entry in expected]
    assert result['items'][0]['rating']['average'] == '4.70'
    assert result['items'][0]['rating']['count'] == 100
    assert all(row['rating']['count'] == 0 for row in result['items'][4:])
    assert 'ranking_score' not in str(result)
    # Découvrir choisit top sans tri explicite, l'ancien appel accessible garde l'ordre par ID.
    assert client.get('/api/v1/recipes?scope=discover&limit=100').json()['items'] == result['items']
    legacy = client.get('/api/v1/recipes?limit=100').json()['items']
    assert [row['id'] for row in legacy] == sorted(row['id'] for row in legacy)


def test_top_sort_is_global_before_limit_and_offset_with_stable_ties(accounts, postgres):
    client, app = accounts
    for i in range(25):
        add_recipe(postgres, f'recipe_sort_{i:02d}')
    add_recipe(postgres, 'recipe_zz_winner')
    add_votes(postgres, 'recipe_zz_winner', add_voters(postgres, 1), [5])
    first = client.get('/api/v1/recipes?sort=top&limit=20').json()
    second = client.get('/api/v1/recipes?sort=top&limit=20&offset=20').json()
    all_rows = client.get('/api/v1/recipes?sort=top&limit=100').json()['items']
    assert first['total'] == second['total'] == 36
    assert first['items'][0]['id'] == 'recipe_zz_winner'
    assert first['items'] + second['items'] == all_rows
    assert [row['id'] for row in all_rows[1:]] == sorted(row['id'] for row in all_rows[1:])
    assert client.get('/api/v1/recipes?sort=top&offset=100').json()['items'] == []


def test_sort_preserves_search_quick_scope_favorites_and_private_rights(accounts, postgres):
    client, app = accounts
    login(app, ALICE)
    public = client.post('/api/v1/recipes', json={**body(), 'name': 'Tri accessible', 'visibility': 'public'}).json()['item']['id']
    private = client.post('/api/v1/recipes', json={**body(), 'name': 'Tri secret'}).json()['item']['id']
    for sort in ('top', 'newest', 'updated'):
        own = client.get(f'/api/v1/recipes?scope=mine&sort={sort}&q=Tri').json()['items']
        assert {row['id'] for row in own} == {public, private}
        login(app, BOB)
        client.put('/api/v1/recipes/' + public + '/favorite')
        result = client.get(f'/api/v1/recipes?scope=favorites&sort={sort}&q=Tri').json()
        assert [row['id'] for row in result['items']] == [public]
        quick = client.get(f'/api/v1/recipes?sort={sort}&quick=true').json()['items']
        assert all(row['total_time_minutes'] <= 30 and row['id'] != private for row in quick)
        login(app, None)
        assert client.get(f'/api/v1/recipes?scope=mine&sort={sort}').status_code == 401
        assert client.get(f'/api/v1/recipes?scope=favorites&sort={sort}').status_code == 401
        visible = client.get(f'/api/v1/recipes?scope=discover&sort={sort}&q=Tri').json()['items']
        assert [row['id'] for row in visible] == [public]
        login(app, ALICE)
    assert client.get('/api/v1/recipes?sort=unknown').status_code == 422


def test_newest_uses_publication_or_creation_and_unknown_dates_last(accounts, postgres):
    client, app = accounts
    # Les recettes initiales du fixture ont une création connue plus récente ;
    # les retirer de cette recherche pour ne comparer que les dates contrôlées.
    early = datetime(2020, 1, 1, tzinfo=timezone.utc)
    later = datetime(2021, 1, 1, tzinfo=timezone.utc)
    for recipe_id, creation, publication in [('recipe_sort_a', later, None), ('recipe_sort_b', early, later),
                                              ('recipe_sort_c', early, None), ('recipe_sort_d', None, None)]:
        add_recipe(postgres, recipe_id, name='Dates contrôlées', created_at=creation, published_at=publication)
    rows = client.get('/api/v1/recipes?sort=newest&q=Dates contrôlées').json()['items']
    assert [row['id'] for row in rows] == ['recipe_sort_a', 'recipe_sort_b', 'recipe_sort_c', 'recipe_sort_d']


def test_mine_defaults_to_creation_newest_first_not_update_or_publication(accounts, postgres):
    client, app = accounts
    login(app, ALICE)
    ids = [client.post('/api/v1/recipes', json={**body(), 'visibility': 'public'}).json()['item']['id'] for _ in range(2)]
    early, later = datetime(2020, 1, 1, tzinfo=timezone.utc), datetime(2021, 1, 1, tzinfo=timezone.utc)
    postgres.execute(update(Recipe).where(Recipe.id == ids[0]).values(created_at=later, updated_at=early, published_at=early))
    postgres.execute(update(Recipe).where(Recipe.id == ids[1]).values(created_at=early, updated_at=later, published_at=later))
    assert [r['id'] for r in client.get('/api/v1/recipes?scope=mine').json()['items']] == ids
    assert [r['id'] for r in client.get('/api/v1/recipes?scope=mine&sort=newest').json()['items']] == ids


@pytest.mark.parametrize('sort', ['top', 'newest', 'updated'])
def test_easy_uses_current_ease_average_before_count_and_pagination(accounts, postgres, sort):
    client, app = accounts
    voters = add_voters(postgres, 2)
    examples = {
        'boundary': [3, 5], 'high': [5, 5], 'below': [3, 4],
        'stale': [5, 5], 'unrated': [],
    }
    for name, scores in examples.items():
        recipe_id = f'recipe_easy_{name}'
        add_recipe(postgres, recipe_id, name='Facilité test', difficulty='easy')
        if scores:
            add_votes(postgres, recipe_id, voters, scores)
    # La note globale n'est pas le critère du filtre.
    postgres.execute(update(RecipeRating).where(RecipeRating.recipe_id == 'recipe_easy_high')
                     .values(taste_score=1, reliability_score=1))
    postgres.execute(update(Recipe).where(Recipe.id == 'recipe_easy_stale').values(content_version=2))
    url = f'/api/v1/recipes?easy=true&q=Facilité test&sort={sort}'
    result = client.get(url + '&limit=100').json()
    assert result['total'] == 2
    assert {r['id'] for r in result['items']} == {'recipe_easy_boundary', 'recipe_easy_high'}
    assert all(Decimal(r['rating']['criteria']['ease']) >= 4 for r in result['items'])
    pages = [client.get(url + f'&limit=1&offset={offset}').json() for offset in range(3)]
    assert all(page['total'] == 2 for page in pages)
    assert pages[0]['items'] + pages[1]['items'] == result['items']
    assert pages[2]['items'] == []
    assert client.get('/api/v1/recipes?easy=false&q=Facilité test').json()['total'] == 5


def test_easy_preserves_visibility_sections_search_and_quick(accounts, postgres):
    client, app = accounts
    voter = add_voters(postgres, 1)
    postgres.execute(insert(Profile).values(id=ALICE.id))
    for name, changes in [('public', {'total_time_minutes': 20, 'prep_time_minutes': 20, 'cook_time_minutes': 0}),
                          ('private', {'owner_id': ALICE.id, 'seed_key': None, 'visibility': 'private'}),
                          ('slow', {'total_time_minutes': 60, 'prep_time_minutes': 60, 'cook_time_minutes': 0})]:
        recipe_id = f'recipe_easy_{name}'
        add_recipe(postgres, recipe_id, name='Facilité test', **changes)
        add_votes(postgres, recipe_id, voter, [4])
    assert client.get('/api/v1/recipes?easy=true&q=introuvable').json()['total'] == 0
    public = client.get('/api/v1/recipes?easy=true&quick=true').json()['items']
    assert [r['id'] for r in public] == ['recipe_easy_public']
    login(app, ALICE)
    own = client.get('/api/v1/recipes?easy=true&scope=mine').json()['items']
    assert [r['id'] for r in own] == ['recipe_easy_private']
    login(app, BOB)
    assert client.put('/api/v1/recipes/recipe_easy_public/favorite').status_code == 204
    favorites = client.get('/api/v1/recipes?easy=true&scope=favorites').json()['items']
    assert [r['id'] for r in favorites] == ['recipe_easy_public']


def test_timestamp_migration_preserves_existing_unknown_dates_and_new_mutations(accounts, postgres):
    client, app = accounts
    config = alembic_config(postgres)
    before = postgres.execute(select(Recipe.id, Recipe.name).order_by(Recipe.id)).all()
    command.downgrade(config, '0011_recipe_ratings')
    command.upgrade(config, 'head')
    assert postgres.execute(select(Recipe.id, Recipe.name).order_by(Recipe.id)).all() == before
    assert all(row == (None, None) for row in postgres.execute(select(Recipe.created_at, Recipe.updated_at)))
    command.check(config)
    login(app, ALICE)
    item = client.post('/api/v1/recipes', json={**body(), 'visibility': 'public'}).json()['item']
    assert item['created_at'] and item['updated_at']
    old = datetime(2000, 1, 1, tzinfo=timezone.utc)
    postgres.execute(update(Recipe).where(Recipe.id == item['id']).values(updated_at=old))
    login(app, BOB)
    client.put('/api/v1/recipes/' + item['id'] + '/rating', json={'recipe_version': 1, 'taste_score': 5, 'reliability_score': 4, 'ease_score': 3})
    assert postgres.scalar(select(Recipe.updated_at).where(Recipe.id == item['id'])) == old
    login(app, ALICE)
    changed = client.put('/api/v1/recipes/' + item['id'], json={**body(), 'name': 'Recette modifiée'}).json()['item']
    assert changed['created_at'] == item['created_at']
    assert datetime.fromisoformat(changed['updated_at']) > old
    for field in ('created_at', 'updated_at'):
        assert client.post('/api/v1/recipes', json={**body(), field: '2000-01-01T00:00:00Z'}).status_code == 422
