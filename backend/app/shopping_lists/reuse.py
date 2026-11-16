"""Réutiliser des besoins figés sans reprendre achats, possession ou tarifs."""
from datetime import datetime, timezone
from decimal import Decimal
from hashlib import sha256
import json
from uuid import UUID, uuid4

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from backend.app.accounts.models import Profile
from backend.app.accounts.service import ensure_profile
from backend.app.catalog.models import Ingredient
from backend.app.security import CurrentUser
from . import service
from .errors import ShoppingListError
from .models import (
    ShoppingList, ShoppingListChoice, ShoppingListCommand, ShoppingListContribution,
    ShoppingListExclusion, ShoppingListItem, ShoppingListQuantity, ShoppingListRevision,
    ShoppingListTemplate, ShoppingResourceCommand,
)
from .schemas import ShoppingCommand, ShoppingContributionRead, ShoppingListRead, ShoppingWarning
from .reuse_schemas import (
    ShoppingDuplicateWrite, ShoppingExclusionRead, ShoppingExclusionWrite,
    ShoppingRevisionSummary, ShoppingTemplateCreate, ShoppingTemplateInstantiate,
    ShoppingTemplateItem, ShoppingTemplateRead, ShoppingTemplateUpdate,
)


def _resource_mutate(db, user, key, operation, body, model, action):
    signature = sha256(json.dumps({'operation': operation,
        'body': body.model_dump(mode='json', exclude_unset=True)}, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    try:
        ensure_profile(db, user)
        pending = db.scalar(select(Profile.deletion_pending).where(Profile.id == user.id).with_for_update())
        if pending:
            raise ShoppingListError(409, 'ACCOUNT_DELETION_PENDING', 'Suppression du compte en cours.')
        if db.scalar(select(ShoppingListCommand.idempotency_key).where(
                ShoppingListCommand.owner_id == user.id, ShoppingListCommand.idempotency_key == key)):
            raise ShoppingListError(409, 'IDEMPOTENCY_KEY_REUSED', 'Cette clé appartient déjà à une autre commande.')
        previous = db.execute(select(ShoppingResourceCommand.__table__).where(
            ShoppingResourceCommand.owner_id == user.id, ShoppingResourceCommand.idempotency_key == key)).mappings().one_or_none()
        if previous:
            if previous['signature'] != signature:
                raise ShoppingListError(409, 'IDEMPOTENCY_KEY_REUSED', 'Cette clé possède déjà un autre contenu.')
            result = model.model_validate(previous['result'])
        else:
            result = action()
            db.execute(insert(ShoppingResourceCommand).values(owner_id=user.id, idempotency_key=key,
                signature=signature, result=result.model_dump(mode='json')))
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


def _template(db: Session, template_id: UUID, user: CurrentUser) -> ShoppingTemplateRead:
    row = db.execute(select(ShoppingListTemplate.__table__).where(ShoppingListTemplate.id == template_id,
        ShoppingListTemplate.owner_id == user.id, ShoppingListTemplate.deleted.is_(False))).mappings().one_or_none()
    if row is None:
        raise ShoppingListError(404, 'TEMPLATE_NOT_FOUND', 'Modèle introuvable.')
    return ShoppingTemplateRead.model_validate({k: v for k, v in row.items() if k != 'owner_id'})


def get_template(db: Session, template_id: UUID, user: CurrentUser) -> ShoppingTemplateRead:
    return _template(db, template_id, user)


def list_templates(db: Session, user: CurrentUser, limit=20, offset=0):
    conditions = (ShoppingListTemplate.owner_id == user.id, ShoppingListTemplate.deleted.is_(False))
    total = db.scalar(select(func.count()).select_from(ShoppingListTemplate).where(*conditions))
    rows = db.execute(select(ShoppingListTemplate.__table__).where(*conditions)
        .order_by(ShoppingListTemplate.updated_at.desc(), ShoppingListTemplate.id).limit(limit).offset(offset)).mappings()
    return [ShoppingTemplateRead.model_validate({k: v for k, v in row.items() if k != 'owner_id'}) for row in rows], total


def create_template(db: Session, user: CurrentUser, body: ShoppingTemplateCreate, key: UUID) -> ShoppingTemplateRead:
    def action():
        source = service.get_revision(db, body.source_list_id, body.source_revision, user).snapshot
        choices = {choice.item_id: choice.product_id for choice in source.choices} if body.include_choices else {}
        items = [ShoppingTemplateItem(id=uuid4(), name=item.name, ingredient_id=item.ingredient_id,
            category=item.category, required=item.required, preferred_product_id=choices.get(item.id) if item.ingredient_id else None)
            for item in source.items if not item.removed]
        if len(items) > 500:
            raise ShoppingListError(422, 'TEMPLATE_TOO_LARGE', 'Un modèle peut contenir au maximum 500 articles.')
        now = datetime.now(timezone.utc)
        result = ShoppingTemplateRead(id=uuid4(), name=body.name, icon=body.icon, revision=1,
            items=items, created_at=now, updated_at=now)
        db.execute(insert(ShoppingListTemplate).values(owner_id=user.id, **result.model_dump(exclude={'items'}),
            items=[item.model_dump(mode='json') for item in items]))
        return result
    return _resource_mutate(db, user, key, 'create_template', body, ShoppingTemplateRead, action)


def change_template(db: Session, template_id: UUID, user: CurrentUser,
                    body: ShoppingTemplateUpdate | ShoppingCommand, key: UUID, *, remove=False) -> ShoppingTemplateRead:
    def action():
        current = _template(db, template_id, user)
        if current.revision != body.expected_revision:
            raise ShoppingListError(409, 'TEMPLATE_REVISION_CONFLICT', 'Le modèle a changé. Actualise-le.',
                expected_revision=body.expected_revision, current_revision=current.revision)
        changes = {'deleted': True} if remove else body.model_dump(exclude_unset=True, exclude={'expected_revision'})
        if 'items' in changes:
            # Préserver les anciennes identités même si le catalogue a changé ;
            # les nouveaux ingrédients doivent appartenir au référentiel.
            previous = {item.id: item.ingredient_id for item in current.items}
            references = {item['ingredient_id'] for item in changes['items'] if item['ingredient_id']
                and previous.get(item['id']) != item['ingredient_id']}
            existing = set(db.scalars(select(Ingredient.id).where(Ingredient.id.in_(references)))) if references else set()
            if references - existing:
                raise ShoppingListError(422, 'INGREDIENT_NOT_FOUND', 'Un nouvel ingrédient est absent du référentiel.')
            changes['items'] = [item.model_dump(mode='json') for item in body.items]
        now = datetime.now(timezone.utc)
        db.execute(update(ShoppingListTemplate).where(ShoppingListTemplate.id == template_id)
            .values(**changes, revision=current.revision + 1, updated_at=now))
        return ShoppingTemplateRead.model_validate({**current.model_dump(), **changes,
            'revision': current.revision + 1, 'updated_at': now})
    return _resource_mutate(db, user, key, ('delete_template:' if remove else 'update_template:') + str(template_id),
                            body, ShoppingTemplateRead, action)


def _clone(db, user, name, purchase_date, items, choices, origin, warnings, source=None):
    """Nouveaux UUID ; seuls besoins, provenance et choix explicites sont copiés."""
    list_id, now = uuid4(), datetime.now(timezone.utc)
    db.execute(insert(ShoppingList).values(id=list_id, owner_id=user.id, name=name,
        source=source.source if source else 'manual', status='draft', revision=1,
        start_date=source.period.start_date if source and source.period else None,
        end_date=source.period.end_date if source and source.period else None,
        purchase_date=purchase_date, origin=origin, created_at=now, updated_at=now))
    references = {item.ingredient_id for item in items if item.ingredient_id}
    existing = set(db.scalars(select(Ingredient.id).where(Ingredient.id.in_(references)))) if references else set()
    for position, item in enumerate(items, start=1):
        item_id = uuid4()
        ingredient = item.ingredient_id if item.ingredient_id in existing else None
        db.execute(insert(ShoppingListItem).values(id=item_id, list_id=list_id,
            ingredient_id=ingredient, name=item.name, category=item.category, position=position, need_revision=1))
        if item.ingredient_id and ingredient is None:
            warnings.append(ShoppingWarning(code='COPY_INGREDIENT_UNAVAILABLE', item_id=item_id,
                message='Ingrédient absent du référentiel ; besoin conservé comme article libre.'))
        for q in item.required:
            db.execute(insert(ShoppingListQuantity).values(item_id=item_id, kind='required', unit=q.unit, amount=Decimal(q.amount)))
        contributions = getattr(item, 'contributions', None)
        if not contributions:
            contributions = [ShoppingContributionRead(id=uuid4(), source='manual',
                original_quantity=q.model_dump(), normalized_quantity=q.model_dump()) for q in item.required]
            if not contributions:
                contributions = [ShoppingContributionRead(id=uuid4(), source='manual', original_quantity=None, normalized_quantity=None)]
        for index, contribution in enumerate(contributions, start=1):
            contribution = contribution.model_copy(update={'id': uuid4()})
            db.execute(insert(ShoppingListContribution).values(id=contribution.id, item_id=item_id,
                position=index, data=contribution.model_dump(mode='json')))
        if choices.get(item.id) and ingredient:
            db.execute(insert(ShoppingListChoice).values(list_id=list_id, item_id=item_id, product_id=choices[item.id]))
            warnings.append(ShoppingWarning(code='COPY_PRODUCT_CHOICES', item_id=item_id,
                message='Choix de produit conservé ; compare pour vérifier sa disponibilité et son prix.'))
    return list_id


def duplicate(db: Session, list_id: UUID, user: CurrentUser, body: ShoppingDuplicateWrite, key: UUID) -> ShoppingListRead:
    warnings = []
    def action(_):
        source = service.get_revision(db, list_id, body.source_revision, user).snapshot
        choices = {c.item_id: c.product_id for c in source.choices} if body.include_choices else {}
        return _clone(db, user, body.name, body.purchase_date, [i for i in source.items if not i.removed],
            choices, {'kind': 'list', 'id': str(list_id), 'revision': body.source_revision}, warnings, source)
    return service._mutate(db, user, key, 'duplicate:' + str(list_id), body, None, action, source_warnings=warnings)


def instantiate(db: Session, template_id: UUID, user: CurrentUser,
                body: ShoppingTemplateInstantiate, key: UUID) -> ShoppingListRead:
    warnings = []
    def action(_):
        template = _template(db, template_id, user)
        if template.revision != body.expected_template_revision:
            raise ShoppingListError(409, 'TEMPLATE_REVISION_CONFLICT', 'Le modèle a changé. Relis ses besoins.',
                expected_revision=body.expected_template_revision, current_revision=template.revision)
        choices = {i.id: i.preferred_product_id for i in template.items if i.preferred_product_id} if body.include_choices else {}
        return _clone(db, user, body.name, body.purchase_date, template.items, choices,
            {'kind': 'template', 'id': str(template_id), 'revision': template.revision}, warnings)
    return service._mutate(db, user, key, 'instantiate:' + str(template_id), body, None, action, source_warnings=warnings)


def list_exclusions(db: Session, user: CurrentUser, limit=20, offset=0):
    query = select(ShoppingListExclusion.ingredient_id, Ingredient.name, ShoppingListExclusion.updated_at).join(
        Ingredient, Ingredient.id == ShoppingListExclusion.ingredient_id).where(ShoppingListExclusion.owner_id == user.id)
    total = db.scalar(select(func.count()).select_from(ShoppingListExclusion).where(ShoppingListExclusion.owner_id == user.id))
    return [ShoppingExclusionRead(**row, excluded=True) for row in db.execute(query.order_by(Ingredient.name,
        ShoppingListExclusion.ingredient_id).limit(limit).offset(offset)).mappings()], total


def set_exclusion(db: Session, ingredient_id: str, user: CurrentUser,
                  body: ShoppingExclusionWrite, key: UUID) -> ShoppingExclusionRead:
    def action():
        name = db.scalar(select(Ingredient.name).where(Ingredient.id == ingredient_id))
        if name is None:
            raise ShoppingListError(404, 'INGREDIENT_NOT_FOUND', 'Ingrédient introuvable.')
        now = datetime.now(timezone.utc)
        if body.excluded:
            db.execute(pg_insert(ShoppingListExclusion).values(owner_id=user.id, ingredient_id=ingredient_id, updated_at=now)
                .on_conflict_do_update(index_elements=['owner_id', 'ingredient_id'], set_={'updated_at': now}))
        else:
            db.execute(delete(ShoppingListExclusion).where(ShoppingListExclusion.owner_id == user.id,
                ShoppingListExclusion.ingredient_id == ingredient_id))
        return ShoppingExclusionRead(ingredient_id=ingredient_id, name=name, excluded=body.excluded, updated_at=now)
    return _resource_mutate(db, user, key, 'exclusion:' + ingredient_id, body, ShoppingExclusionRead, action)


def list_revisions(db: Session, list_id: UUID, user: CurrentUser, limit=20, offset=0):
    service._owned_list(db, list_id, user)
    query = select(ShoppingListRevision).where(ShoppingListRevision.list_id == list_id)
    total = db.scalar(select(func.count()).select_from(ShoppingListRevision).where(ShoppingListRevision.list_id == list_id))
    rows = db.scalars(query.order_by(ShoppingListRevision.revision.desc()).limit(limit).offset(offset))
    return [ShoppingRevisionSummary(list_id=list_id, revision=row.revision, recorded_at=row.recorded_at,
        name=row.snapshot['name'], status=row.snapshot['status'], item_count=row.snapshot['totals']['item_count']) for row in rows], total
