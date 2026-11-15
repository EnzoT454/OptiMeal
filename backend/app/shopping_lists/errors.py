"""Erreurs métier des services privés, indépendantes du raccordement HTTP."""
from backend.app.common.contracts import ApiError
from .schemas import ShoppingConflict


class ShoppingListError(Exception):
    def __init__(self, status: int, code: str, message: str, **context):
        super().__init__(message)
        self.status = status
        self.code = code
        self.error = (ShoppingConflict(code=code, message=message, **context)
                      if status == 409 else ApiError(code=code, message=message))
