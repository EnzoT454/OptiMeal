"""Identité validée et profil minimal, sans champs de mot de passe."""
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import StringConstraints
from backend.app.common.contracts import ContractModel


class Identity(ContractModel):
    id: UUID
    email: str | None


class ProfilePatch(ContractModel):
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] | None


class ProfileRead(Identity):
    display_name: str | None
    created_at: datetime


class AccountDelete(ContractModel):
    confirmation: Literal['SUPPRIMER']
