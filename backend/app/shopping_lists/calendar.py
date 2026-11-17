"""Aperçu privé d'une période de repas, sans sauvegarde ni appel HTTP interne."""
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from fractions import Fraction
from hashlib import sha256
import json
from uuid import UUID, uuid5

from pydantic import ValidationError
from sqlalchemy import and_, select, text
from sqlalchemy.orm import Session

from backend.app.catalog.models import Ingredient
from backend.app.common.public_data import today
from backend.app.common.units import decimal_quantity, quantity_fraction
from backend.app.planning.models import MealPlanEntry
from backend.app.recipes.models import Recipe, RecipeIngredient
from backend.app.recipes.service import visible
from backend.app.security import CurrentUser
from .errors import ShoppingListError
from .schemas import (
    ShoppingBaseQuantity, ShoppingCalendarPreviewRead, ShoppingCalendarPreviewWrite,
    ShoppingContributionRead, ShoppingFromCalendar, ShoppingItemRead, ShoppingPeriod,
    ShoppingQuantity,
)

CALCULATION_VERSION = 'shopping-calendar-fractions-ceil6-v1'


@dataclass(frozen=True)
class IngredientSource:
    id: str
    name: str
    category: str
    quantity: Decimal
    unit: str


@dataclass(frozen=True)
class RecipeSource:
    id: str
    name: str
    version: int
    servings: int
    visibility: str
    ingredients: tuple[IngredientSource, ...]


@dataclass(frozen=True)
class MealSource:
    id: UUID
    date: date
    meal: str
    servings: int
    is_leftover: bool = False
    free_text: str | None = None
    has_recipe_reference: bool = True
    recipe: RecipeSource | None = None


def _decimal_text(value: Decimal) -> str:
    result = format(value, 'f')
    return result.rstrip('0').rstrip('.') if '.' in result else result


def _source_record(meal: MealSource) -> dict:
    recipe = meal.recipe if not meal.is_leftover and meal.free_text is None else None
    return {
        'id': str(meal.id), 'date': meal.date.isoformat(), 'meal': meal.meal,
        'servings': meal.servings, 'is_leftover': meal.is_leftover,
        'free_text': meal.free_text, 'has_recipe_reference': meal.has_recipe_reference,
        'recipe': None if recipe is None else {
            'id': recipe.id, 'name': recipe.name, 'version': recipe.version,
            'servings': recipe.servings, 'visibility': recipe.visibility,
            'ingredients': [
                {'id': i.id, 'name': i.name, 'category': i.category,
                 'quantity': _decimal_text(i.quantity), 'unit': i.unit}
                for i in sorted(recipe.ingredients, key=lambda i: i.id)],
        },
    }


def aggregate_period(user: CurrentUser, period: ShoppingPeriod, purchase_date: date,
                     meals: list[MealSource], *,
                     excluded_ingredient_ids: frozenset[str] = frozenset()) -> ShoppingCalendarPreviewRead:
    """Calcul pur ; seules les sources déjà autorisées par le lecteur sont reçues.

    Les exclusions sont des préférences privées chargées côté serveur, jamais
    une liste envoyée librement par le mobile dans le contrat d’aperçu.
    """
    selected = sorted((m for m in meals if period.start_date <= m.date <= period.end_date),
                      key=lambda m: (m.date, str(m.id)))
    if len({m.id for m in selected}) != len(selected):
        raise ValueError('Repas dupliqué dans la période.')
    source = {
        'calculation_version': CALCULATION_VERSION, 'user_id': str(user.id),
        'period': period.model_dump(mode='json'), 'purchase_date': purchase_date.isoformat(),
        'excluded_ingredient_ids': sorted(excluded_ingredient_ids),
        'meals': [_source_record(m) for m in selected],
    }
    fingerprint = sha256(json.dumps(source, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':')).encode()).hexdigest()
    totals, contributions, infos = defaultdict(lambda: Fraction(0)), defaultdict(list), {}
    rounded_ingredients, excluded_meals = set(), []
    included = notes = leftovers = 0
    applied_exclusions = set()
    for meal in selected:
        if meal.is_leftover:
            leftovers += 1
            continue
        if meal.free_text is not None:
            notes += 1
            continue
        recipe = meal.recipe
        if recipe is None:
            excluded_meals.append({'meal_entry_id': meal.id, 'reason': 'recipe_unavailable'})
            continue
        if not recipe.ingredients or len({i.id for i in recipe.ingredients}) != len(recipe.ingredients):
            raise ValueError('Ingrédients de recette absents ou dupliqués.')
        included += 1
        for ingredient in recipe.ingredients:
            if ingredient.id in excluded_ingredient_ids:
                applied_exclusions.add(ingredient.id)
                continue
            value, unit = quantity_fraction(ingredient.quantity, ingredient.unit,
                                             servings=meal.servings, recipe_servings=recipe.servings)
            normalized, rounded = decimal_quantity(value)
            totals[(ingredient.id, unit)] += value
            if rounded:
                rounded_ingredients.add(ingredient.id)
            previous = infos.setdefault(ingredient.id, (ingredient.name, ingredient.category))
            if previous != (ingredient.name, ingredient.category):
                raise ValueError('Métadonnées canoniques incohérentes.')
            contributions[ingredient.id].append(ShoppingContributionRead(
                id=uuid5(user.id, f'{fingerprint}:contribution:{meal.id}:{ingredient.id}'),
                source='calendar', meal_entry_id=meal.id, recipe_id=recipe.id,
                recipe_name=recipe.name, recipe_version=recipe.version, recipe_servings=recipe.servings,
                meal_date=meal.date, servings=meal.servings,
                original_quantity=ShoppingQuantity(amount=_decimal_text(ingredient.quantity), unit=ingredient.unit),
                normalized_quantity=ShoppingBaseQuantity(amount=_decimal_text(normalized), unit=unit)))
    items, warnings = [], []
    for ingredient_id, (name, category) in sorted(infos.items(), key=lambda pair: (pair[1][1], pair[1][0], pair[0])):
        item_id = uuid5(user.id, f'{fingerprint}:item:{ingredient_id}')
        required = []
        for (reference, unit), value in sorted(totals.items()):
            if reference == ingredient_id:
                amount, rounded = decimal_quantity(value)
                required.append(ShoppingBaseQuantity(amount=_decimal_text(amount), unit=unit))
                if rounded:
                    rounded_ingredients.add(ingredient_id)
        review = len(required) > 1
        if review:
            warnings.append({'code': 'INCOMPATIBLE_UNITS', 'item_id': item_id,
                             'message': 'Besoins en unités incompatibles ; vérifie les quantités.'})
        if ingredient_id in rounded_ingredients:
            warnings.append({'code': 'QUANTITY_ROUNDED', 'item_id': item_id,
                             'message': 'Somme exacte avant arrondi ; fractions non finies affichées par excès à six décimales.'})
        items.append(ShoppingItemRead(id=item_id, ingredient_id=ingredient_id, name=name, category=category,
            need_revision=1, required=required, contributions=contributions[ingredient_id],
            coverage_status='remaining', pricing_status='needs_review' if review else 'unpriced'))
    if excluded_meals:
        warnings.append({'code': 'CALENDAR_PARTIAL',
                         'message': f'Liste partielle : {len(excluded_meals)} repas sans recette accessible.'})
    if applied_exclusions:
        warnings.append({'code': 'CALENDAR_EXCLUSIONS', 'message': 'Des ingrédients sont exclus de cette génération.'})
    return ShoppingCalendarPreviewRead(
        period=period, purchase_date=purchase_date, preview_fingerprint=fingerprint,
        included_meal_count=included, skipped_note_count=notes, skipped_leftover_count=leftovers,
        excluded_meals=excluded_meals, excluded_ingredient_ids=sorted(applied_exclusions),
        items=items, warnings=warnings)


def _read_period(db: Session, user: CurrentUser, period: ShoppingPeriod) -> list[MealSource]:
    """Deux lectures groupées dans le même instantané PostgreSQL."""
    rows = db.execute(select(
        MealPlanEntry.id, MealPlanEntry.date, MealPlanEntry.meal, MealPlanEntry.servings,
        MealPlanEntry.is_leftover, MealPlanEntry.free_text,
        MealPlanEntry.recipe_id.label('reference_id'), Recipe.id.label('recipe_id'),
        Recipe.name.label('recipe_name'), Recipe.content_version.label('recipe_version'),
        Recipe.servings.label('recipe_servings'), Recipe.visibility,
    ).outerjoin(Recipe, and_(Recipe.id == MealPlanEntry.recipe_id, visible(user.id))).where(
        MealPlanEntry.user_id == user.id, MealPlanEntry.date >= period.start_date,
        MealPlanEntry.date <= period.end_date,
    ).order_by(MealPlanEntry.date, MealPlanEntry.id)).mappings().all()
    recipe_ids = {r['recipe_id'] for r in rows if r['recipe_id'] and not r['is_leftover'] and r['free_text'] is None}
    ingredients = defaultdict(list)
    if recipe_ids:
        values = db.execute(select(RecipeIngredient.recipe_id, RecipeIngredient.ingredient_id,
            RecipeIngredient.quantity, RecipeIngredient.unit, Ingredient.name, Ingredient.category,
        ).join(Ingredient, Ingredient.id == RecipeIngredient.ingredient_id).where(
            RecipeIngredient.recipe_id.in_(recipe_ids),
        ).order_by(RecipeIngredient.recipe_id, RecipeIngredient.position)).mappings()
        for r in values:
            ingredients[r['recipe_id']].append(IngredientSource(r['ingredient_id'], r['name'], r['category'], r['quantity'], r['unit']))
    meals = []
    for r in rows:
        recipe = RecipeSource(r['recipe_id'], r['recipe_name'], r['recipe_version'], r['recipe_servings'],
                              r['visibility'], tuple(ingredients[r['recipe_id']])) if r['recipe_id'] in recipe_ids else None
        meals.append(MealSource(r['id'], r['date'], r['meal'], r['servings'], r['is_leftover'],
                                r['free_text'], r['reference_id'] is not None, recipe))
    return meals


def _read_preview(db: Session, user: CurrentUser, body: ShoppingCalendarPreviewWrite) -> ShoppingCalendarPreviewRead:
    """À utiliser seulement dans la transaction cohérente de l'opération appelante."""
    period = ShoppingPeriod(start_date=body.start_date, end_date=body.end_date)
    try:
        from .models import ShoppingListExclusion
        exclusions = frozenset(db.scalars(select(ShoppingListExclusion.ingredient_id).where(ShoppingListExclusion.owner_id == user.id)))
        return aggregate_period(user, period, body.purchase_date or today(), _read_period(db, user, period), excluded_ingredient_ids=exclusions)
    except (ValidationError, ValueError, ArithmeticError) as exc:
        raise ShoppingListError(503, 'CALENDAR_DATA_INVALID', 'Les besoins du calendrier sont invalides.') from exc


@contextmanager
def _preview_transaction(db: Session):
    if db.in_transaction():
        raise RuntimeError('L’aperçu nécessite une session dédiée sans transaction ouverte.')
    try:
        db.connection(execution_options={'isolation_level': 'REPEATABLE READ'})
        db.execute(text('SET TRANSACTION READ ONLY'))
        yield
    finally:
        db.rollback()


def preview_calendar(db: Session, user: CurrentUser,
                     body: ShoppingCalendarPreviewWrite) -> ShoppingCalendarPreviewRead:
    with _preview_transaction(db):
        preview = _read_preview(db, user, body)
        if not preview.included_meal_count:
            raise ShoppingListError(422, 'NO_PLANNED_MEALS', 'Aucun repas exploitable dans cette période.')
        return preview


def _read_validated_preview(db: Session, user: CurrentUser,
                            body: ShoppingFromCalendar) -> ShoppingCalendarPreviewRead:
    """Relire et vérifier dans la transaction de création, sans commit séparé."""
    preview = _read_preview(db, user, body)
    if preview.preview_fingerprint != body.preview_fingerprint:
        raise ShoppingListError(409, 'CALENDAR_PREVIEW_STALE', 'Le calendrier a changé. Recommence l’aperçu.')
    if not preview.included_meal_count:
        raise ShoppingListError(422, 'NO_PLANNED_MEALS', 'Aucun repas exploitable dans cette période.')
    if preview.excluded_meals and not body.accept_partial:
        raise ShoppingListError(422, 'PARTIAL_CALENDAR_CONFIRMATION_REQUIRED', 'Confirme les repas exclus avant la création.')
    if not preview.items and preview.excluded_ingredient_ids and not body.accept_empty:
        raise ShoppingListError(422, 'EMPTY_LIST_CONFIRMATION_REQUIRED', 'Les ingrédients sont exclus. Confirme la création d’une liste vide.')
    return preview


def validate_calendar_preview(db: Session, user: CurrentUser,
                              body: ShoppingFromCalendar) -> ShoppingCalendarPreviewRead:
    """Vérification à blanc ; ne crée ni liste ni commande idempotente.

    La sauvegarde de l'étape 5 appelle _read_validated_preview dans SA
    transaction d'écriture, pas persister le résultat d'une transaction terminée.
    """
    with _preview_transaction(db):
        return _read_validated_preview(db, user, body)
