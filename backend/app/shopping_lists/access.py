"""Préférence privée : identité serveur, droits et commandes rejouables."""
from uuid import UUID
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from backend.app.security import CurrentUser
from sqlalchemy.dialects.postgresql import insert
from . import service
from .access_schemas import ShoppingPinRead, ShoppingPinWrite
from .errors import ShoppingListError
from .models import ShoppingList, ShoppingListPin
from .reuse import _resource_mutate


def get_pin(db: Session, user: CurrentUser) -> ShoppingPinRead:
    list_id = db.scalar(select(ShoppingListPin.list_id).join(ShoppingList,
        (ShoppingList.id == ShoppingListPin.list_id) & (ShoppingList.owner_id == ShoppingListPin.owner_id))
        .where(ShoppingListPin.owner_id == user.id, ShoppingList.status.in_(('draft', 'active'))))
    return ShoppingPinRead(list_id=list_id)


def set_pin(db: Session, user: CurrentUser, body: ShoppingPinWrite, key: UUID) -> ShoppingPinRead:
    def action():
        if body.list_id is None:
            db.execute(delete(ShoppingListPin).where(ShoppingListPin.owner_id == user.id))
        else:
            resource = service._owned_list(db, body.list_id, user, lock=True)
            if resource['status'] not in ('draft', 'active'):
                raise ShoppingListError(409, 'LIST_STATE_CONFLICT', 'Épingle une liste en cours.')
            db.execute(insert(ShoppingListPin).values(owner_id=user.id, list_id=body.list_id)
                .on_conflict_do_update(index_elements=['owner_id'], set_={'list_id': body.list_id}))
        return ShoppingPinRead(list_id=body.list_id)
    return _resource_mutate(db, user, key, 'shopping_list_pin', body, ShoppingPinRead, action)
