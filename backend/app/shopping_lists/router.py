"""Listes privées ; identité du jeton, commandes idempotentes et révisions."""
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Query, Request
from sqlalchemy.orm import Session

from backend.app.common.contracts import Detail, ErrorResponse, Page, ResponseMeta
from backend.app.database import get_db
from backend.app.security import CurrentUser, current_user
from . import service, comparisons
from .calendar import preview_calendar
from .schemas import (
    ShoppingCalendarPreviewRead, ShoppingCalendarPreviewWrite, ShoppingCommand,
    ShoppingConflictResponse, ShoppingFromCalendar, ShoppingItemAdd, ShoppingItemUpdate,
    ShoppingListCreate, ShoppingListRead, ShoppingListUpdate, ShoppingManualPurchaseWrite,
    ShoppingPossessionWrite, ShoppingRevisionRead, ShoppingChoiceWrite, ShoppingApplyComparison, ShoppingComparisonRead, ShoppingProductPurchaseWrite, ShoppingCompleteWrite,
)

router = APIRouter(prefix='/api/v1/shopping-lists', tags=['Listes v1'], responses={
    401: {'model': ErrorResponse}, 404: {'model': ErrorResponse},
    409: {'model': ShoppingConflictResponse}, 422: {'model': ErrorResponse},
    503: {'model': ErrorResponse},
})
User = Annotated[CurrentUser, Depends(current_user)]
DB = Annotated[Session, Depends(get_db)]
Key = Annotated[UUID, Header(alias='Idempotency-Key')]


def detail(item):
    return {'item': item, 'meta': ResponseMeta(data_source='postgresql',
        dataset_kind='user_content', review_required=False)}


@router.get('', response_model=Page[ShoppingListRead])
def lists(user: User, db: DB, status: Literal['draft', 'active', 'completed', 'archived'] | None = None,
          limit: Annotated[int, Query(ge=1, le=100)] = 20,
          offset: Annotated[int, Query(ge=0)] = 0, collection: Literal['current', 'history'] | None = None):
    items, total = service.list_lists(db, user, status=status, limit=limit, offset=offset, collection=collection)
    return dict(items=items, total=total, limit=limit, offset=offset, meta=detail(None)['meta'])


@router.post('', response_model=Detail[ShoppingListRead], status_code=201)
def create(body: ShoppingListCreate, user: User, db: DB, key: Key):
    return detail(service.create_list(db, user, body, key))


@router.post('/calendar-preview', response_model=Detail[ShoppingCalendarPreviewRead])
def preview(body: ShoppingCalendarPreviewWrite, user: User, db: DB):
    return detail(preview_calendar(db, user, body))


@router.post('/from-calendar', response_model=Detail[ShoppingListRead], status_code=201)
def from_calendar(body: ShoppingFromCalendar, user: User, db: DB, key: Key):
    return detail(service.create_from_calendar(db, user, body, key))


@router.get('/{list_id}', response_model=Detail[ShoppingListRead])
def read(list_id: UUID, user: User, db: DB):
    return detail(service.get_list(db, list_id, user))


@router.patch('/{list_id}', response_model=Detail[ShoppingListRead])
def update(list_id: UUID, body: ShoppingListUpdate, user: User, db: DB, key: Key):
    return detail(service.update_list(db, list_id, user, body, key))


@router.post('/{list_id}/items', response_model=Detail[ShoppingListRead])
def add_item(list_id: UUID, body: ShoppingItemAdd, user: User, db: DB, key: Key):
    return detail(service.add_item(db, list_id, user, body, key))


@router.patch('/{list_id}/items/{item_id}', response_model=Detail[ShoppingListRead])
def update_item(list_id: UUID, item_id: UUID, body: ShoppingItemUpdate, user: User, db: DB, key: Key):
    return detail(service.update_item(db, list_id, item_id, user, body, key))


@router.put('/{list_id}/items/{item_id}/manual-purchase', response_model=Detail[ShoppingListRead])
def purchase(list_id: UUID, item_id: UUID, body: ShoppingManualPurchaseWrite, user: User, db: DB, key: Key):
    return detail(service.set_manual_purchase(db, list_id, item_id, user, body, key))


@router.put('/{list_id}/items/{item_id}/possession', response_model=Detail[ShoppingListRead])
def possession(list_id: UUID, item_id: UUID, body: ShoppingPossessionWrite, user: User, db: DB, key: Key):
    return detail(service.set_possession(db, list_id, item_id, user, body, key))


@router.post('/{list_id}/activate', response_model=Detail[ShoppingListRead])
def activate(list_id: UUID, body: ShoppingCommand, user: User, db: DB, key: Key):
    return detail(service.change_status(db, list_id, user, 'activate', body, key))


@router.post('/{list_id}/archive', response_model=Detail[ShoppingListRead])
def archive(list_id: UUID, body: ShoppingCommand, user: User, db: DB, key: Key):
    return detail(service.change_status(db, list_id, user, 'archive', body, key))


@router.post('/{list_id}/reopen', response_model=Detail[ShoppingListRead])
def reopen(list_id: UUID, body: ShoppingCommand, user: User, db: DB, key: Key):
    return detail(service.change_status(db, list_id, user, 'reopen', body, key))


@router.get('/{list_id}/revisions/{revision}', response_model=Detail[ShoppingRevisionRead])
def revision(list_id: UUID, revision: Annotated[int, Path(ge=1)], user: User, db: DB):
    return detail(service.get_revision(db, list_id, revision, user))


@router.post('/{list_id}/comparisons', response_model=Detail[ShoppingComparisonRead])
def compare(list_id: UUID, request: Request, user: User, db: DB):
    return detail(comparisons.compare(db, list_id, user,
        lambda session, day: comparisons.load_sales(request, session, day)))


@router.post('/{list_id}/apply-comparison', response_model=Detail[ShoppingListRead])
def apply_comparison(list_id: UUID, body: ShoppingApplyComparison, request: Request, user: User, db: DB, key: Key):
    return detail(comparisons.apply(db, list_id, user, body, key,
        lambda session, day: comparisons.load_sales(request, session, day)))


@router.put('/{list_id}/items/{item_id}/choice', response_model=Detail[ShoppingListRead])
def choice(list_id: UUID, item_id: UUID, body: ShoppingChoiceWrite, request: Request, user: User, db: DB, key: Key):
    return detail(comparisons.choose(db, list_id, item_id, user, body, key,
        lambda session, day: comparisons.load_sales(request, session, day)))


@router.put('/{list_id}/product-purchases', response_model=Detail[ShoppingListRead])
def product_purchase(list_id: UUID, body: ShoppingProductPurchaseWrite, user: User, db: DB, key: Key):
    from .courses import set_product_purchase
    return detail(set_product_purchase(db, list_id, user, body, key))


@router.post('/{list_id}/complete', response_model=Detail[ShoppingListRead])
def complete(list_id: UUID, body: ShoppingCompleteWrite, user: User, db: DB, key: Key):
    from .courses import complete as complete_courses
    return detail(complete_courses(db, list_id, user, body, key))


from . import reuse
from .reuse_schemas import ShoppingDuplicateWrite, ShoppingRevisionSummary


@router.post('/{list_id}/duplicate', response_model=Detail[ShoppingListRead], status_code=201)
def duplicate(list_id: UUID, body: ShoppingDuplicateWrite, user: User, db: DB, key: Key):
    return detail(reuse.duplicate(db, list_id, user, body, key))


@router.get('/{list_id}/revisions', response_model=Page[ShoppingRevisionSummary])
def revisions(list_id: UUID, user: User, db: DB, limit: Annotated[int, Query(ge=1, le=100)] = 20,
              offset: Annotated[int, Query(ge=0)] = 0):
    items, total = reuse.list_revisions(db, list_id, user, limit, offset)
    return dict(items=items, total=total, limit=limit, offset=offset, meta=detail(None)['meta'])
