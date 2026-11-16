"""Accès explicite à une liste privée depuis Accueil et Calendrier."""
from uuid import UUID
from backend.app.common.contracts import ContractModel


class ShoppingPinWrite(ContractModel):
    list_id: UUID | None


class ShoppingPinRead(ContractModel):
    list_id: UUID | None
