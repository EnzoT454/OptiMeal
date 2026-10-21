"""Profil créé à la demande après validation Supabase ; aucun compte Auth local."""
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from backend.app.security import CurrentUser
from .models import Profile
from .schemas import ProfileRead


def ensure_profile(db: Session, user: CurrentUser) -> None:
    db.execute(insert(Profile).values(id=user.id).on_conflict_do_nothing())


def read_profile(db: Session, user: CurrentUser) -> ProfileRead:
    row = db.execute(select(Profile.__table__).where(Profile.id == user.id)).mappings().one()
    return ProfileRead(email=user.email, **dict(row))
