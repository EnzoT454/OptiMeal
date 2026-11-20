"""Services transactionnels du lot A : listes manuelles et copies du calendrier.

Chaque mutation possède sa transaction et termine par commit ou rollback.
Les lectures utilisent uniquement l’état courant, afin de ne pas reconstruire
une liste depuis plusieurs états concurrents. Aucun appel réseau ou collecte.
"""
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal, localcontext
from hashlib import sha256
import json
from typing import Callable
from uuid import UUID, uuid4

from sqlalchemy import and_, delete, func, insert, select, update
from sqlalchemy.orm import Session

from backend.app.accounts.models import Profile
from backend.app.accounts.service import ensure_profile
from backend.app.catalog.models import Ingredient
from backend.app.common.public_data import today
from backend.app.common.units import normalize_quantity
from backend.app.security import CurrentUser
from .errors import ShoppingListError
from .models import (
    ShoppingList, ShoppingListChoice, ShoppingListCommand, ShoppingListContribution, ShoppingListItem,
    ShoppingListPurchase, ShoppingListPurchaseQuantity, ShoppingListQuantity,
    ShoppingListRevision,
)
from .schemas import (
    ShoppingBaseQuantity, ShoppingCommand, ShoppingContributionRead, ShoppingFromCalendar,
    ShoppingItemAdd, ShoppingItemRead, ShoppingItemUpdate, ShoppingListCreate,
    ShoppingListRead, ShoppingListUpdate, ShoppingManualPurchaseRead,
    ShoppingManualPurchaseWrite, ShoppingPossessionWrite, ShoppingQuantity,
    ShoppingTotals,
)


def _not_found():
    raise ShoppingListError(404, 'LIST_NOT_FOUND', 'Liste ou article introuvable.')


def _owned_list(db: Session, list_id: UUID, user: CurrentUser, *, lock=False):
    query = select(ShoppingList.__table__).where(ShoppingList.id == list_id, ShoppingList.owner_id == user.id)
    if lock:
        query = query.with_for_update()
    row = db.execute(query).mappings().one_or_none()
    if row is None:
        _not_found()
    return row


def get_list(db: Session, list_id: UUID, user: CurrentUser) -> ShoppingListRead:
    snapshot = db.scalar(select(ShoppingListRevision.snapshot).join(ShoppingList, and_(
        ShoppingList.id == ShoppingListRevision.list_id,
        ShoppingList.revision == ShoppingListRevision.revision,
    )).where(ShoppingList.id == list_id, ShoppingList.owner_id == user.id))
    if snapshot is None:
        _not_found()
    return ShoppingListRead.model_validate(snapshot)


def list_lists(db: Session, user: CurrentUser, *, status: str | None = None,
               limit: int = 20, offset: int = 0, collection: str | None = None,
               start_date: date | None = None, end_date: date | None = None) -> tuple[list[ShoppingListRead], int]:
    if not 1 <= limit <= 100 or offset < 0 or status not in (None, 'draft', 'active', 'completed', 'archived'):
        raise ShoppingListError(422, 'VALIDATION_ERROR', 'Filtres ou pagination invalides.')
    if collection not in (None, 'current', 'history') or (collection is not None and status is not None):
        raise ShoppingListError(422, 'VALIDATION_ERROR', 'Choisis une collection ou un statut.')
    if (start_date is None) != (end_date is None) or (start_date is not None and end_date < start_date):
        raise ShoppingListError(422, 'VALIDATION_ERROR', 'Indique une période complète et ordonnée.')
    conditions = [ShoppingList.owner_id == user.id]
    if start_date is not None:
        conditions.extend((ShoppingList.start_date == start_date, ShoppingList.end_date == end_date))
    if collection is not None:
        conditions.append(ShoppingList.status.in_(('draft', 'active') if collection == 'current' else ('completed', 'archived')))
    if status is not None:
        conditions.append(ShoppingList.status == status)
    query = select(ShoppingListRevision.snapshot).join(ShoppingList, and_(
        ShoppingList.id == ShoppingListRevision.list_id,
        ShoppingList.revision == ShoppingListRevision.revision,
    )).where(*conditions).order_by(ShoppingList.updated_at.desc(), ShoppingList.id).limit(limit).offset(offset)
    total = db.scalar(select(func.count()).select_from(ShoppingList).where(*conditions))
    return [ShoppingListRead.model_validate(value) for value in db.scalars(query)], total


def _quantities(rows, owner_key: str):
    result = defaultdict(list)
    for row in rows:
        result[row[owner_key]].append({'amount': format(row['amount'], 'f'), 'unit': row['unit']})
    return result


def _sum_exact(a: Decimal, b: Decimal) -> Decimal:
    with localcontext() as context:
        context.prec = max(1, a.adjusted() + 1, b.adjusted() + 1) + max(0, -a.as_tuple().exponent, -b.as_tuple().exponent) + 2
        return a + b


def _coverage_status(required, owned, owned_confirmation, purchase, need_revision):
    """Classification des quantités déjà persistées ; aucun calcul de paquets."""
    needs = {q['unit']: Decimal(q['amount']) for q in required}
    available = {q['unit']: Decimal(q['amount']) for q in owned}
    bought = {q.unit: Decimal(q.amount) for q in purchase.coverage} if purchase and purchase.purchased else {}
    covered = {u: _sum_exact(available.get(u, Decimal(0)), bought.get(u, Decimal(0))) for u in needs}
    confirmation = purchase.confirmed_need_revision if purchase and purchase.purchased else None
    stale = (owned_confirmation is not None and owned_confirmation != need_revision or
             confirmation is not None and confirmation != need_revision or
             bool((set(available) | set(bought)) - set(needs)) and not (not needs and confirmation == need_revision))
    if not needs:
        status = ('owned' if owned_confirmation == need_revision else
                  'purchased' if confirmation == need_revision else 'remaining')
    elif all(available.get(u, 0) >= n for u, n in needs.items()):
        status = 'owned'
    elif all(covered[u] >= n for u, n in needs.items()):
        status = 'purchased'
    elif any(covered[u] > 0 for u in needs):
        status = 'partial'
    else:
        status = 'remaining'
    return status, bool(stale)


def _snapshot(db: Session, list_id: UUID, user: CurrentUser, source_warnings=None) -> ShoppingListRead:
    row = _owned_list(db, list_id, user)
    items = db.execute(select(ShoppingListItem.__table__).where(
        ShoppingListItem.list_id == list_id).order_by(ShoppingListItem.position)).mappings().all()
    quantities = db.execute(select(ShoppingListQuantity.__table__).join(
        ShoppingListItem, ShoppingListItem.id == ShoppingListQuantity.item_id,
    ).where(ShoppingListItem.list_id == list_id).order_by(ShoppingListQuantity.unit)).mappings().all()
    required = _quantities([q for q in quantities if q['kind'] == 'required'], 'item_id')
    owned = _quantities([q for q in quantities if q['kind'] == 'owned'], 'item_id')
    contributions = defaultdict(list)
    for c in db.execute(select(ShoppingListContribution.__table__).join(
            ShoppingListItem, ShoppingListItem.id == ShoppingListContribution.item_id,
    ).where(ShoppingListItem.list_id == list_id).order_by(ShoppingListContribution.position)).mappings():
        contributions[c['item_id']].append(ShoppingContributionRead.model_validate(c['data']))
    purchases = db.execute(select(ShoppingListPurchase.__table__).where(
        ShoppingListPurchase.list_id == list_id).order_by(ShoppingListPurchase.id)).mappings().all()
    coverage = _quantities(db.execute(select(ShoppingListPurchaseQuantity.__table__).join(
        ShoppingListPurchase, ShoppingListPurchase.id == ShoppingListPurchaseQuantity.purchase_id,
    ).where(ShoppingListPurchase.list_id == list_id).order_by(ShoppingListPurchaseQuantity.unit)).mappings(), 'purchase_id')
    purchases_read = [ShoppingManualPurchaseRead(
        **{k: p[k] for k in ('id', 'item_id', 'purchased', 'confirmed_need_revision')},
        coverage=coverage[p['id']]) for p in purchases]
    from .courses import read_purchases, purchase_coverage
    product_purchases = read_purchases(db, list_id)
    by_item = purchase_coverage(purchases_read, product_purchases)
    # Les avertissements d'import appartiennent à l'instantané d'origine.
    # Les avertissements de couverture, eux, sont recalculés à chaque commande.
    previous = db.scalar(select(ShoppingListRevision.snapshot).where(
        ShoppingListRevision.list_id == list_id).order_by(ShoppingListRevision.revision.desc()).limit(1))
    durable_codes = {'CALENDAR_PARTIAL', 'CALENDAR_EXCLUSIONS', 'QUANTITY_ROUNDED', 'COPY_PRODUCT_CHOICES', 'COPY_INGREDIENT_UNAVAILABLE'}
    warnings = ([w for w in source_warnings if w.code in durable_codes]
                if source_warnings is not None else [
                    w for w in (previous or {}).get('warnings', []) if w['code'] in durable_codes])
    result = []
    for item in items:
        status, stale = _coverage_status(required[item['id']], owned[item['id']],
                                        item['owned_unquantified_need_revision'], by_item.get(item['id']), item['need_revision'])
        result.append(ShoppingItemRead(
            **{k: item[k] for k in ('id', 'ingredient_id', 'name', 'category', 'need_revision', 'removed',
                                   'owned_unquantified_need_revision')},
            required=required[item['id']], owned=owned[item['id']], contributions=contributions[item['id']],
            coverage_status=status, pricing_status='needs_review' if stale or len(required[item['id']]) > 1 else 'unpriced'))
        if len(required[item['id']]) > 1 and not item['removed']:
            warnings.append({'code': 'INCOMPATIBLE_UNITS', 'message': 'Besoins en unités incompatibles ; vérifie les quantités.', 'item_id': item['id']})
        if stale and not item['removed']:
            warnings.append({'code': 'COVERAGE_NEEDS_REVIEW', 'message': 'Le besoin a changé ; vérifie sa couverture.', 'item_id': item['id']})
    active = [i for i in result if not i.removed]
    unpriced = sum(i.coverage_status != 'owned' for i in active)
    uncovered = sum(i.coverage_status in ('remaining', 'partial') for i in active)
    if unpriced:
        warnings.append({'code': 'ESTIMATE_UNAVAILABLE', 'message': 'Estimation indisponible : achats non chiffrés.'})
    totals = ShoppingTotals(
        item_count=len(active), remaining_item_count=uncovered,
        purchased_item_count=sum(i.coverage_status == 'purchased' for i in active),
        owned_item_count=sum(i.coverage_status == 'owned' for i in active),
        partial_item_count=sum(i.coverage_status == 'partial' for i in active),
        unpriced_item_count=unpriced, uncovered_item_count=uncovered,
        budget_known_amount='0', remaining_known_amount='0', estimate_complete=not (unpriced or uncovered))
    if product_purchases:
        from fractions import Fraction
        from .comparisons import _amount
        bought_amount = _amount(sum((Fraction(Decimal(p.estimated_amount)) for p in product_purchases), Fraction()))
        totals = totals.model_copy(update={'budget_known_amount': bought_amount})
    resource = ShoppingListRead(
        **{k: row[k] for k in ('id', 'name', 'kind', 'source', 'status', 'revision', 'purchase_date', 'origin')},
        created_at=row['created_at'].astimezone(timezone.utc), updated_at=row['updated_at'].astimezone(timezone.utc),
        period={'start_date': row['start_date'], 'end_date': row['end_date']} if row['source'] == 'calendar' else None,
        items=result, purchases=purchases_read, product_purchases=product_purchases, totals=totals, warnings=warnings)
    from .comparisons import decorate
    return decorate(db, resource)


def _mutate(db: Session, user: CurrentUser, key: UUID, operation: str, body,
            list_id: UUID | None, action: Callable[[UUID | None], UUID], *,
            repeatable_read=False, source_warnings=None) -> ShoppingListRead:
    """Le verrou profil sérialise les commandes d'un compte et sa suppression.

    Choix volontaire pour le prototype : une seule mutation par compte à la
    fois, y compris les créations de listes avec la même clé.
    """
    signature = sha256(json.dumps({'operation': operation, 'list_id': str(list_id) if list_id else None,
        'body': body.model_dump(mode='json', exclude_unset=True)}, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    try:
        if repeatable_read:
            if db.in_transaction():
                raise RuntimeError('La création calendrier nécessite une session dédiée.')
            db.connection(execution_options={'isolation_level': 'REPEATABLE READ'})
        ensure_profile(db, user)
        profile = db.execute(select(Profile.deletion_pending).where(Profile.id == user.id).with_for_update()).one()
        if profile.deletion_pending:
            raise ShoppingListError(409, 'ACCOUNT_DELETION_PENDING', 'Suppression du compte en cours.')
        from .models import ShoppingResourceCommand
        if db.scalar(select(ShoppingResourceCommand.idempotency_key).where(
                ShoppingResourceCommand.owner_id == user.id, ShoppingResourceCommand.idempotency_key == key)):
            raise ShoppingListError(409, 'IDEMPOTENCY_KEY_REUSED', 'Cette clé appartient déjà à une autre commande.')
        current = _owned_list(db, list_id, user, lock=True) if list_id else None
        previous = db.execute(select(ShoppingListCommand.__table__).where(
            ShoppingListCommand.owner_id == user.id, ShoppingListCommand.idempotency_key == key)).mappings().one_or_none()
        if previous:
            if previous['signature'] != signature:
                raise ShoppingListError(409, 'IDEMPOTENCY_KEY_REUSED', 'Cette clé de commande a déjà un autre contenu.')
            result = ShoppingListRead.model_validate(previous['result'])
            db.commit()
            return result
        if current is not None and current['revision'] != body.expected_revision:
            raise ShoppingListError(409, 'LIST_REVISION_CONFLICT', 'La liste a changé. Relis les modifications.',
                                    list_id=list_id, expected_revision=body.expected_revision, current_revision=current['revision'])
        if current is not None and operation not in ('activate', 'archive', 'reopen') and current['status'] not in ('draft', 'active'):
            raise ShoppingListError(409, 'LIST_STATE_CONFLICT', 'Rouvre la liste avant de la modifier.')
        if current is not None:
            from .comparisons import upgrade_assignment
            upgrade_assignment(db, get_list(db, list_id, user))
        target_id = action(list_id)
        if current is not None:
            db.execute(update(ShoppingList).where(ShoppingList.id == target_id).values(
                revision=current['revision'] + 1, updated_at=datetime.now(timezone.utc)))
        result = _snapshot(db, target_id, user, source_warnings)
        _validate_kind(result)
        payload = result.model_dump(mode='json')
        db.execute(insert(ShoppingListCommand).values(owner_id=user.id, idempotency_key=key,
                                                     list_id=target_id, signature=signature, result=payload))
        db.execute(delete(ShoppingListRevision).where(ShoppingListRevision.list_id == target_id))
        db.execute(insert(ShoppingListRevision).values(list_id=target_id, revision=result.revision,
            command_id=key, recorded_at=result.updated_at, snapshot=payload))
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


def _validate_kind(resource):
    """Validation finale atomique, commune à toutes les mutations privées.

    NULL conserve la compatibilité des anciennes listes et commandes clientes.
    Les nouvelles listes du mobile ont toujours un type explicite immuable.
    """
    if resource.kind is None:
        return
    active = {item.id for item in resource.items if not item.removed}
    choices = {choice.item_id for choice in resource.choices}
    product_items = set(choices)
    if resource.assignment:
        product_items.update(item_id for need in resource.assignment.scenario.needs
                             if need.lines for item_id in need.item_ids)
    product_items.update(item_id for purchase in resource.product_purchases
                         if purchase.purchased_units for item_id in purchase.item_ids)
    invalid = (resource.kind == 'articles' and bool(active & product_items) or
               resource.kind == 'products' and bool(active - choices))
    if invalid:
        raise ShoppingListError(422, 'LIST_KIND_CONFLICT',
            'Une liste d’articles et une liste de produits ne peuvent pas être mélangées.')


def _initial_items(db, list_id, items, start_position=1, resolve_names=False):
    if resolve_names:
        from .draft_pricing import resolve_items
        items = resolve_items(db, items)
    for position, item in enumerate(items, start=start_position):
        ingredient = db.get(Ingredient, item.ingredient_id) if item.ingredient_id else None
        if item.ingredient_id and ingredient is None:
            raise ShoppingListError(422, 'INGREDIENT_NOT_FOUND', 'Ingrédient introuvable dans le référentiel.')
        item_id = uuid4()
        db.execute(insert(ShoppingListItem).values(id=item_id, list_id=list_id,
            ingredient_id=item.ingredient_id, name=item.name, category=ingredient.category if ingredient else 'Autres',
            position=position, need_revision=1))
        _contribution(db, item_id, item.quantity)
        if item.quantity:
            quantity = _normalize(item.quantity)
            db.execute(insert(ShoppingListQuantity).values(item_id=item_id, kind='required',
                unit=quantity.unit, amount=Decimal(quantity.amount)))


def create_list(db: Session, user: CurrentUser, body: ShoppingListCreate, key: UUID, price_source=None) -> ShoppingListRead:
    def create(_):
        list_id = uuid4()
        now = datetime.now(timezone.utc)
        db.execute(insert(ShoppingList).values(id=list_id, owner_id=user.id, name=body.name, source='manual', kind=body.kind,
            status='active' if body.activate else 'draft', revision=1, purchase_date=body.purchase_date or today(), created_at=now, updated_at=now))
        # Une liste vide active est une vraie ressource : l'ajout vient ensuite.
        # Le panier reste facultatif et aucune lecture de prix n'est implicite.
        _initial_items(db, list_id, body.items, resolve_names=body.pricing is not None)
        if body.pricing is not None:
            from .draft_pricing import attach
            if price_source is None:
                raise ShoppingListError(503, 'CATALOG_UNAVAILABLE', 'Catalogue indisponible.')
            attach(db, list_id, user, body.pricing, price_source)
        return list_id
    return _mutate(db, user, key, 'create', body, None, create)


def create_from_calendar(db: Session, user: CurrentUser, body: ShoppingFromCalendar, key: UUID, price_source=None) -> ShoppingListRead:
    """Relecture et sauvegarde atomiques ; chaque import possède ses propres IDs."""
    from sqlalchemy.exc import IntegrityError, OperationalError
    from .calendar import _read_validated_preview

    if db.in_transaction():
        raise RuntimeError('La création calendrier nécessite une session dédiée.')
    warnings = []

    def create(_):
        preview = _read_validated_preview(db, user, body)
        excluded = set(body.excluded_item_ids)
        if excluded - {item.id for item in preview.items}:
            raise ShoppingListError(422, 'INVALID_PREVIEW_ITEM', 'Un article retiré ne correspond pas à cet aperçu.')
        adjustments = {item.item_id: item.required for item in body.adjusted_items}
        if len(adjustments) != len(body.adjusted_items) or set(adjustments) - {item.id for item in preview.items if item.id not in excluded}:
            raise ShoppingListError(422, 'INVALID_PREVIEW_ITEM', 'Correction dupliquée ou hors de cet aperçu.')
        selected = [item.model_copy(update={'required': adjustments.get(item.id, item.required)})
                    for item in preview.items if item.id not in excluded]
        if len(selected) + len(body.items) > 500:
            raise ShoppingListError(422, 'LIST_TOO_LARGE', 'Une liste peut contenir au maximum 500 articles.')
        if body.activate and not selected and not body.items:
            raise ShoppingListError(422, 'EMPTY_LIST', 'Ajoute au moins un article avant de créer la liste.')
        list_id, now = uuid4(), datetime.now(timezone.utc)
        db.execute(insert(ShoppingList).values(id=list_id, owner_id=user.id, name=body.name,
            source='calendar', kind=body.kind, status='active' if body.activate else 'draft', revision=1, start_date=body.start_date,
            end_date=body.end_date, purchase_date=preview.purchase_date, created_at=now, updated_at=now))
        identities = {}
        for position, item in enumerate(selected, start=1):
            item_id = identities[item.id] = uuid4()
            db.execute(insert(ShoppingListItem).values(id=item_id, list_id=list_id,
                ingredient_id=item.ingredient_id, name=item.name, category=item.category,
                position=position, need_revision=1))
            for quantity in item.required:
                db.execute(insert(ShoppingListQuantity).values(item_id=item_id, kind='required',
                    unit=quantity.unit, amount=Decimal(quantity.amount)))
            for index, contribution in enumerate(item.contributions, start=1):
                contribution = contribution.model_copy(update={'id': uuid4()})
                db.execute(insert(ShoppingListContribution).values(id=contribution.id,
                    item_id=item_id, position=index, data=contribution.model_dump(mode='json')))
        _initial_items(db, list_id, body.items, len(selected) + 1, resolve_names=body.pricing is not None)
        if body.pricing is not None:
            from .draft_pricing import attach
            if price_source is None:
                raise ShoppingListError(503, 'CATALOG_UNAVAILABLE', 'Catalogue indisponible.')
            attach(db, list_id, user, body.pricing, price_source)
        warnings[:] = [w.model_copy(update={'item_id': identities.get(w.item_id)})
                       for w in preview.warnings if w.item_id is None or w.item_id in identities]
        return list_id

    for attempt in range(3):
        try:
            return _mutate(db, user, key, 'from_calendar', body, None, create,
                           repeatable_read=True, source_warnings=warnings)
        except (OperationalError, IntegrityError) as exc:
            # PostgreSQL peut annuler un écrivain concurrent en REPEATABLE READ.
            # Un registre écrit après l'instantané RR peut aussi provoquer
            # l'unicité de la commande. Rejouer toute la transaction relit alors
            # ce registre dans un nouvel instantané, avec la même clé.
            serialization = getattr(exc.orig, 'sqlstate', None) == '40001'
            duplicate_command = (getattr(exc.orig, 'sqlstate', None) == '23505' and
                getattr(getattr(exc.orig, 'diag', None), 'constraint_name', None) == 'pk_shopping_list_command')
            if not (serialization or duplicate_command):
                raise
            if attempt == 2:
                raise ShoppingListError(503, 'LIST_BUSY', 'La liste est occupée. Réessaie.') from exc


def update_list(db: Session, list_id: UUID, user: CurrentUser, body: ShoppingListUpdate, key: UUID) -> ShoppingListRead:
    def change(target):
        db.execute(update(ShoppingList).where(ShoppingList.id == target).values(
            **body.model_dump(exclude_unset=True, exclude={'expected_revision'})))
        return target
    return _mutate(db, user, key, 'update', body, list_id, change)


def change_status(db: Session, list_id: UUID, user: CurrentUser, operation: str,
                  body: ShoppingCommand, key: UUID) -> ShoppingListRead:
    transitions = {'activate': ({'draft'}, 'active'), 'archive': ({'draft', 'active'}, 'archived'),
                   'reopen': ({'archived', 'completed'}, 'active')}
    if operation not in transitions:
        raise ShoppingListError(422, 'VALIDATION_ERROR', 'Transition inconnue.')
    def change(target):
        current = _owned_list(db, target, user)
        allowed, status = transitions[operation]
        if current['status'] not in allowed | {status}:
            raise ShoppingListError(409, 'LIST_STATE_CONFLICT', 'Transition indisponible pour cette liste.')
        db.execute(update(ShoppingList).where(ShoppingList.id == target).values(status=status))
        return target
    return _mutate(db, user, key, operation, body, list_id, change)


def _item(db: Session, list_id: UUID, item_id: UUID):
    row = db.execute(select(ShoppingListItem.__table__).where(
        ShoppingListItem.id == item_id, ShoppingListItem.list_id == list_id)).mappings().one_or_none()
    if row is None:
        _not_found()
    return row


def _normalize(quantity: ShoppingQuantity) -> ShoppingBaseQuantity:
    value = normalize_quantity(Decimal(quantity.amount), quantity.unit)
    return ShoppingBaseQuantity(amount=format(value.amount, 'f'), unit=value.unit)


def _contribution(db: Session, item_id: UUID, quantity: ShoppingQuantity | None):
    contribution = ShoppingContributionRead(id=uuid4(), source='manual', original_quantity=quantity,
                                           normalized_quantity=_normalize(quantity) if quantity else None)
    position = db.scalar(select(func.coalesce(func.max(ShoppingListContribution.position), 0)).where(
        ShoppingListContribution.item_id == item_id)) + 1
    db.execute(insert(ShoppingListContribution).values(id=contribution.id, item_id=item_id,
                                                      position=position, data=contribution.model_dump(mode='json')))


def add_item(db: Session, list_id: UUID, user: CurrentUser, body: ShoppingItemAdd, key: UUID, price_source=None) -> ShoppingListRead:
    def change(target):
        ingredient = db.get(Ingredient, body.ingredient_id) if body.ingredient_id else None
        if body.ingredient_id and ingredient is None:
            raise ShoppingListError(404, 'INGREDIENT_NOT_FOUND', 'Ingrédient introuvable dans le référentiel.')
        normalized = _normalize(body.quantity) if body.quantity else None
        item_id = None
        if ingredient and body.merge == 'add':
            candidates = db.execute(select(ShoppingListItem.__table__).where(
                ShoppingListItem.list_id == target, ShoppingListItem.ingredient_id == ingredient.id,
                ShoppingListItem.removed.is_(False)).order_by(ShoppingListItem.position)).mappings().all()
            for candidate in candidates:
                units = set(db.scalars(select(ShoppingListQuantity.unit).where(
                    ShoppingListQuantity.item_id == candidate['id'], ShoppingListQuantity.kind == 'required')))
                if (normalized and units) or (normalized is None and not units):
                    item_id = candidate['id']
                    break
        if item_id is None:
            item_id = uuid4()
            position = db.scalar(select(func.coalesce(func.max(ShoppingListItem.position), 0)).where(ShoppingListItem.list_id == target)) + 1
            db.execute(insert(ShoppingListItem).values(id=item_id, list_id=target, ingredient_id=body.ingredient_id,
                name=body.name, category=ingredient.category if ingredient else 'Autres', position=position, need_revision=1))
        else:
            db.execute(update(ShoppingListItem).where(ShoppingListItem.id == item_id).values(need_revision=ShoppingListItem.need_revision + 1))
        _contribution(db, item_id, body.quantity)
        if normalized:
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            command = pg_insert(ShoppingListQuantity).values(item_id=item_id, kind='required',
                                                            unit=normalized.unit, amount=Decimal(normalized.amount))
            db.execute(command.on_conflict_do_update(index_elements=['item_id', 'kind', 'unit'],
                set_={'amount': ShoppingListQuantity.amount + command.excluded.amount}))
        if body.product_id is not None:
            from .recalculation import apply_product_selection
            apply_product_selection(db, target, item_id, user, body.product_id, price_source)
        return target
    return _mutate(db, user, key, 'add_item', body, list_id, change)


def update_item(db: Session, list_id: UUID, item_id: UUID, user: CurrentUser,
                body: ShoppingItemUpdate, key: UUID, price_source=None) -> ShoppingListRead:
    def change(target):
        item = _item(db, target, item_id)
        kind = db.scalar(select(ShoppingList.kind).where(ShoppingList.id == target))
        if 'name' in body.model_fields_set and body.name != item['name'] and kind == 'products':
            raise ShoppingListError(422, 'PRODUCT_NAME_IMMUTABLE', 'Le nom d’un produit du catalogue ne peut pas être modifié.')
        values = body.model_dump(exclude_unset=True, exclude={'expected_revision', 'quantity', 'refresh_prices', 'product_units'})
        products = kind == 'products'
        if kind is None and (body.refresh_prices or body.product_units is not None):
            legacy = _snapshot(db, target, user)
            active_ids = {i.id for i in legacy.items if not i.removed}
            selected_ids = {c.item_id for c in legacy.choices}
            if legacy.assignment:
                selected_ids.update(i for need in legacy.assignment.scenario.needs if need.lines for i in need.item_ids)
            products = bool(active_ids) and active_ids <= selected_ids
        sales = None
        if body.product_units is not None:
            if not products:
                raise ShoppingListError(422, 'LIST_KIND_CONFLICT', 'Le nombre de produits est réservé aux listes de produits.')
            if price_source is None:
                raise ShoppingListError(503, 'CATALOG_UNAVAILABLE', 'Catalogue indisponible.')
            sales = price_source(db, today())
            product_id = db.scalar(select(ShoppingListChoice.product_id).where(ShoppingListChoice.item_id == item_id))
            sale = next((s for s in sales if s.product_id == product_id and s.ingredient_id == item['ingredient_id']), None)
            if sale is None or sale.match_status == 'rejected':
                raise ShoppingListError(422, 'PRODUCT_NOT_MATCHED', 'Produit absent ou incompatible.')
            # Une unité saisie désigne un emballage de vente, y compris un paquet de plusieurs pièces.
            size = sale.format.quantity if sale.format.kind == 'fixed' else Decimal(1)
            unit = sale.format.unit if sale.format.kind == 'fixed' else 'unit'
            from .purchases import _quantity
            from fractions import Fraction
            amount = _quantity(Fraction(size) * body.product_units)
            db.execute(delete(ShoppingListQuantity).where(ShoppingListQuantity.item_id == item_id,
                ShoppingListQuantity.kind == 'required'))
            db.execute(insert(ShoppingListQuantity).values(item_id=item_id, kind='required', unit=unit, amount=Decimal(amount)))
            values['need_revision'] = item['need_revision'] + 1
        if 'quantity' in body.model_fields_set:
            if body.quantity is None:
                db.execute(delete(ShoppingListQuantity).where(ShoppingListQuantity.item_id == item_id,
                                                              ShoppingListQuantity.kind == 'required'))
            else:
                normalized = _normalize(body.quantity)
                from sqlalchemy.dialects.postgresql import insert as pg_insert
                command = pg_insert(ShoppingListQuantity).values(item_id=item_id, kind='required',
                    unit=normalized.unit, amount=Decimal(normalized.amount))
                db.execute(command.on_conflict_do_update(index_elements=['item_id', 'kind', 'unit'],
                                                         set_={'amount': command.excluded.amount}))
            values['need_revision'] = item['need_revision'] + 1
        db.execute(update(ShoppingListItem).where(ShoppingListItem.id == item_id).values(**values))
        if products and (body.refresh_prices or body.product_units is not None):
            from .recalculation import refresh_current_prices
            refresh_current_prices(db, target, user, price_source, sales=sales)
        return target
    return _mutate(db, user, key, 'update_item:' + str(item_id), body, list_id, change)


def _validate_coverage(db: Session, item, coverage):
    if item['removed']:
        raise ShoppingListError(409, 'LIST_STATE_CONFLICT', 'Rétablis l’article avant cette action.')
    units = set(db.scalars(select(ShoppingListQuantity.unit).where(
        ShoppingListQuantity.item_id == item['id'], ShoppingListQuantity.kind == 'required')))
    if (coverage.confirms_unquantified and units or
            any(q.unit not in units for q in coverage.quantities)):
        raise ShoppingListError(422, 'COVERAGE_INCOMPATIBLE', 'La couverture ne correspond pas au besoin consulté.')


def set_possession(db: Session, list_id: UUID, item_id: UUID, user: CurrentUser,
                   body: ShoppingPossessionWrite, key: UUID) -> ShoppingListRead:
    def change(target):
        item = _item(db, target, item_id)
        _validate_coverage(db, item, body.coverage)
        db.execute(delete(ShoppingListQuantity).where(ShoppingListQuantity.item_id == item_id, ShoppingListQuantity.kind == 'owned'))
        for q in body.coverage.quantities:
            db.execute(insert(ShoppingListQuantity).values(item_id=item_id, kind='owned', unit=q.unit, amount=Decimal(q.amount)))
        db.execute(update(ShoppingListItem).where(ShoppingListItem.id == item_id).values(
            owned_unquantified_need_revision=item['need_revision'] if body.coverage.confirms_unquantified else None))
        return target
    return _mutate(db, user, key, 'possession:' + str(item_id), body, list_id, change)


def set_manual_purchase(db: Session, list_id: UUID, item_id: UUID, user: CurrentUser,
                        body: ShoppingManualPurchaseWrite, key: UUID) -> ShoppingListRead:
    def change(target):
        item = _item(db, target, item_id)
        _validate_coverage(db, item, body.coverage)
        purchase_id = db.scalar(select(ShoppingListPurchase.id).where(ShoppingListPurchase.item_id == item_id))
        values = dict(purchased=body.purchased,
                      confirmed_need_revision=item['need_revision'] if body.coverage.confirms_unquantified else None)
        if purchase_id is None:
            purchase_id = uuid4()
            db.execute(insert(ShoppingListPurchase).values(id=purchase_id, list_id=target, item_id=item_id, **values))
        else:
            db.execute(update(ShoppingListPurchase).where(ShoppingListPurchase.id == purchase_id).values(**values))
        db.execute(delete(ShoppingListPurchaseQuantity).where(ShoppingListPurchaseQuantity.purchase_id == purchase_id))
        for q in body.coverage.quantities:
            db.execute(insert(ShoppingListPurchaseQuantity).values(purchase_id=purchase_id, unit=q.unit, amount=Decimal(q.amount)))
        return target
    return _mutate(db, user, key, 'manual_purchase:' + str(item_id), body, list_id, change)
