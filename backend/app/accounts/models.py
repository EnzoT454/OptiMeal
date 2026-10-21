"""Profil métier lié à auth.users, dont Supabase conserve la gestion."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, MetaData, Table, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base

# Métadonnées séparées : Alembic ne doit ni créer ni modifier auth.users.
auth_users = Table('users', MetaData(), Column('id', Uuid, primary_key=True), schema='auth')


class Profile(Base):
    __tablename__ = 'profile'
    __table_args__ = (CheckConstraint('display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 80',
                                    name='display_name_valid'),)
    id: Mapped[UUID] = mapped_column(Uuid, ForeignKey(auth_users.c.id, ondelete='CASCADE'), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
