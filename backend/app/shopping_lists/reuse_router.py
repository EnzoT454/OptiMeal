"""Modèles et exclusions privés, avec les mêmes contrats et verrous que Liste."""
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Query
from backend.app.common.contracts import Detail, Page, IngredientId
from .router import User, DB, Key, detail, router as list_router
from . import reuse, access
from .access_schemas import ShoppingPinRead, ShoppingPinWrite
from .schemas import ShoppingCommand, ShoppingListRead
from .reuse_schemas import (
    ShoppingExclusionRead, ShoppingExclusionWrite, ShoppingTemplateCreate,
    ShoppingTemplateInstantiate, ShoppingTemplateRead, ShoppingTemplateUpdate,
)

router = APIRouter(prefix='/api/v1', tags=['Réutilisation des listes v1'], responses=list_router.responses)
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


def page(items, total, limit, offset):
    return dict(items=items, total=total, limit=limit, offset=offset, meta=detail(None)['meta'])


@router.get('/shopping-list-templates', response_model=Page[ShoppingTemplateRead])
def templates(user: User, db: DB, limit: Limit = 20, offset: Offset = 0):
    items, total = reuse.list_templates(db, user, limit, offset)
    return page(items, total, limit, offset)


@router.post('/shopping-list-templates', response_model=Detail[ShoppingTemplateRead], status_code=201)
def create_template(body: ShoppingTemplateCreate, user: User, db: DB, key: Key):
    return detail(reuse.create_template(db, user, body, key))


@router.get('/shopping-list-templates/{template_id}', response_model=Detail[ShoppingTemplateRead])
def template(template_id: UUID, user: User, db: DB):
    return detail(reuse.get_template(db, template_id, user))


@router.patch('/shopping-list-templates/{template_id}', response_model=Detail[ShoppingTemplateRead])
def update_template(template_id: UUID, body: ShoppingTemplateUpdate, user: User, db: DB, key: Key):
    return detail(reuse.change_template(db, template_id, user, body, key))


@router.delete('/shopping-list-templates/{template_id}', response_model=Detail[ShoppingTemplateRead])
def delete_template(template_id: UUID, body: ShoppingCommand, user: User, db: DB, key: Key):
    return detail(reuse.change_template(db, template_id, user, body, key, remove=True))


@router.post('/shopping-list-templates/{template_id}/instantiate', response_model=Detail[ShoppingListRead], status_code=201)
def instantiate(template_id: UUID, body: ShoppingTemplateInstantiate, user: User, db: DB, key: Key):
    return detail(reuse.instantiate(db, template_id, user, body, key))


@router.get('/shopping-list-exclusions', response_model=Page[ShoppingExclusionRead])
def exclusions(user: User, db: DB, limit: Limit = 20, offset: Offset = 0):
    items, total = reuse.list_exclusions(db, user, limit, offset)
    return page(items, total, limit, offset)


@router.put('/shopping-list-exclusions/{ingredient_id}', response_model=Detail[ShoppingExclusionRead])
def exclusion(ingredient_id: IngredientId, body: ShoppingExclusionWrite, user: User, db: DB, key: Key):
    return detail(reuse.set_exclusion(db, ingredient_id, user, body, key))


@router.delete('/shopping-list-exclusions/{ingredient_id}', response_model=Detail[ShoppingExclusionRead])
def remove_exclusion(ingredient_id: IngredientId, user: User, db: DB, key: Key):
    return detail(reuse.set_exclusion(db, ingredient_id, user, ShoppingExclusionWrite(excluded=False), key))


@router.get('/shopping-list-pin', response_model=Detail[ShoppingPinRead])
def read_pin(user: User, db: DB):
    return detail(access.get_pin(db, user))


@router.put('/shopping-list-pin', response_model=Detail[ShoppingPinRead])
def write_pin(body: ShoppingPinWrite, user: User, db: DB, key: Key):
    return detail(access.set_pin(db, user, body, key))
