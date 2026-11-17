"""Persistance privée du lot A ; quantités relationnelles et historique figé."""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, ForeignKeyConstraint,
    Index, Integer, Numeric, Text, UniqueConstraint, Uuid, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database import Base


class ShoppingList(Base):
    __tablename__ = 'shopping_list'
    __table_args__ = (
        UniqueConstraint('id', 'owner_id', name='uq_shopping_list_id_owner'),
        CheckConstraint('length(btrim(name)) BETWEEN 1 AND 120', name='name_valid'),
        CheckConstraint("source IN ('manual', 'calendar')", name='source_supported'),
        CheckConstraint("status IN ('draft', 'active', 'completed', 'archived')", name='status_supported'),
        CheckConstraint('revision > 0', name='revision_positive'),
        CheckConstraint("(source = 'manual' AND start_date IS NULL AND end_date IS NULL) OR "
                        "(source = 'calendar' AND start_date IS NOT NULL AND end_date IS NOT NULL "
                        'AND end_date >= start_date)', name='period_coherent'),
        CheckConstraint('updated_at >= created_at', name='timestamps_ordered'),
        Index('ix_shopping_list_owner_status_updated', 'owner_id', 'status', 'updated_at'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    origin: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('now()'))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('now()'))


class ShoppingListItem(Base):
    __tablename__ = 'shopping_list_item'
    __table_args__ = (
        UniqueConstraint('list_id', 'id', name='uq_shopping_list_item_list_id_id'),
        UniqueConstraint('list_id', 'position', name='uq_shopping_list_item_list_id_position'),
        CheckConstraint('position > 0 AND need_revision > 0', name='positive_versions'),
        CheckConstraint('length(btrim(name)) BETWEEN 1 AND 120', name='name_valid'),
        CheckConstraint('length(btrim(category)) BETWEEN 1 AND 120', name='category_valid'),
        CheckConstraint('owned_unquantified_need_revision IS NULL OR '
                        '(owned_unquantified_need_revision > 0 AND owned_unquantified_need_revision <= need_revision)',
                        name='owned_revision_valid'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    list_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('shopping_list.id', ondelete='CASCADE'), nullable=False)
    ingredient_id: Mapped[str | None] = mapped_column(Text, ForeignKey('ingredient.id', ondelete='SET NULL'))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    need_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    removed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    owned_unquantified_need_revision: Mapped[int | None] = mapped_column(Integer)


class ShoppingListQuantity(Base):
    __tablename__ = 'shopping_list_quantity'
    __table_args__ = (
        CheckConstraint("kind IN ('required', 'owned')", name='kind_supported'),
        CheckConstraint("unit IN ('g', 'ml', 'unit')", name='unit_supported'),
        CheckConstraint("amount > 0 AND amount < 'Infinity'::numeric", name='amount_finite_positive'),
    )
    item_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('shopping_list_item.id', ondelete='CASCADE'), primary_key=True)
    kind: Mapped[str] = mapped_column(Text, primary_key=True)
    unit: Mapped[str] = mapped_column(Text, primary_key=True)
    amount: Mapped[Decimal] = mapped_column(Numeric, nullable=False)


class ShoppingListContribution(Base):
    __tablename__ = 'shopping_list_contribution'
    __table_args__ = (
        CheckConstraint("jsonb_typeof(data) = 'object'", name='data_object'),
        UniqueConstraint('item_id', 'position', name='uq_shopping_list_contribution_item_position'),
        CheckConstraint('position > 0', name='position_positive'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    item_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('shopping_list_item.id', ondelete='CASCADE'), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # Provenance Pydantic versionnée, conservée même si les sources disparaissent.
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)


class ShoppingListPurchase(Base):
    __tablename__ = 'shopping_list_purchase'
    __table_args__ = (
        ForeignKeyConstraint(['list_id', 'item_id'], ['shopping_list_item.list_id', 'shopping_list_item.id'],
                             ondelete='CASCADE', name='fk_shopping_list_purchase_item_in_list'),
        UniqueConstraint('item_id', name='uq_shopping_list_purchase_item_id'),
        CheckConstraint('confirmed_need_revision IS NULL OR '
                        '(confirmed_need_revision > 0 AND purchased)', name='confirmed_revision_valid'),
        Index('ix_shopping_list_purchase_list_id', 'list_id'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    list_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    item_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    purchased: Mapped[bool] = mapped_column(Boolean, nullable=False)
    confirmed_need_revision: Mapped[int | None] = mapped_column(Integer)


class ShoppingListPurchaseQuantity(Base):
    __tablename__ = 'shopping_list_purchase_quantity'
    __table_args__ = (
        CheckConstraint("unit IN ('g', 'ml', 'unit')", name='unit_supported'),
        CheckConstraint("amount > 0 AND amount < 'Infinity'::numeric", name='amount_finite_positive'),
    )
    purchase_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('shopping_list_purchase.id', ondelete='CASCADE'), primary_key=True)
    unit: Mapped[str] = mapped_column(Text, primary_key=True)
    amount: Mapped[Decimal] = mapped_column(Numeric, nullable=False)


class ShoppingListRevision(Base):
    __tablename__ = 'shopping_list_revision'
    __table_args__ = (
        CheckConstraint('revision > 0', name='revision_positive'),
        CheckConstraint("(jsonb_typeof(snapshot) = 'object' AND snapshot ?& ARRAY['id', 'revision'] "
                        "AND snapshot->>'id' = list_id::text AND (snapshot->>'revision')::integer = revision) IS TRUE",
                        name='snapshot_identity'),
        UniqueConstraint('list_id', 'command_id', name='uq_shopping_list_revision_list_command'),
    )
    list_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('shopping_list.id', ondelete='CASCADE'), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    command_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('now()'))
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)


class ShoppingListCommand(Base):
    __tablename__ = 'shopping_list_command'
    __table_args__ = (
        ForeignKeyConstraint(['list_id', 'owner_id'], ['shopping_list.id', 'shopping_list.owner_id'],
                             ondelete='CASCADE', name='fk_shopping_list_command_owned_list'),
        CheckConstraint("signature ~ '^[a-f0-9]{64}$'", name='signature_valid'),
        CheckConstraint("(jsonb_typeof(result) = 'object' AND result ?& ARRAY['id', 'revision'] "
                        "AND result->>'id' = list_id::text) IS TRUE", name='result_identity'),
        Index('ix_shopping_list_command_list_id', 'list_id'),
    )
    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), primary_key=True)
    idempotency_key: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    list_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    signature: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('now()'))


class ShoppingListComparison(Base):
    __tablename__ = 'shopping_list_comparison'
    __table_args__ = (
        UniqueConstraint('id', 'list_id', name='uq_shopping_list_comparison_id_list'),
        CheckConstraint("jsonb_typeof(data) = 'object'", name='data_object'),
        Index('ix_shopping_list_comparison_list_id', 'list_id'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    list_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('shopping_list.id', ondelete='CASCADE'), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)


class ShoppingListChoice(Base):
    __tablename__ = 'shopping_list_choice'
    __table_args__ = (
        ForeignKeyConstraint(['list_id', 'item_id'], ['shopping_list_item.list_id', 'shopping_list_item.id'],
                             ondelete='CASCADE', name='fk_shopping_list_choice_item_in_list'),
        CheckConstraint('length(product_id) BETWEEN 1 AND 512', name='product_id_valid'),
        Index('ix_shopping_list_choice_list_id', 'list_id'),
    )
    item_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    list_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    product_id: Mapped[str] = mapped_column(Text, nullable=False)


class ShoppingListAssignment(Base):
    __tablename__ = 'shopping_list_assignment'
    __table_args__ = (
        ForeignKeyConstraint(['comparison_id', 'list_id'], ['shopping_list_comparison.id', 'shopping_list_comparison.list_id'],
                             ondelete='CASCADE', name='fk_shopping_list_assignment_comparison_in_list'),
        CheckConstraint("jsonb_typeof(data) = 'object'", name='data_object'),
    )
    list_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('shopping_list.id', ondelete='CASCADE'), primary_key=True)
    comparison_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)


class ShoppingListProductPurchase(Base):
    __tablename__ = 'shopping_list_product_purchase'
    __table_args__ = (
        ForeignKeyConstraint(['comparison_id', 'list_id'],
            ['shopping_list_comparison.id', 'shopping_list_comparison.list_id'],
            ondelete='CASCADE', name='fk_shopping_product_purchase_comparison_in_list'),
        CheckConstraint("jsonb_typeof(data) = 'object'", name='data_object'),
        Index('ix_shopping_list_product_purchase_list_id', 'list_id'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    list_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('shopping_list.id', ondelete='CASCADE'), nullable=False)
    comparison_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)


class ShoppingListTemplate(Base):
    __tablename__ = 'shopping_list_template'
    __table_args__ = (
        CheckConstraint('length(btrim(name)) BETWEEN 1 AND 120', name='name_valid'),
        CheckConstraint("icon IN ('basket', 'cart', 'leaf', 'restaurant', 'home')", name='icon_supported'),
        CheckConstraint('revision > 0', name='revision_positive'),
        CheckConstraint("jsonb_typeof(items) = 'array'", name='items_array'),
        CheckConstraint('updated_at >= created_at', name='timestamps_ordered'),
        Index('ix_shopping_list_template_owner_updated', 'owner_id', 'updated_at'),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str] = mapped_column(Text, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    items: Mapped[list] = mapped_column(JSONB, nullable=False)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ShoppingListExclusion(Base):
    __tablename__ = 'shopping_list_exclusion'
    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), primary_key=True)
    ingredient_id: Mapped[str] = mapped_column(Text, ForeignKey('ingredient.id', ondelete='CASCADE'), primary_key=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ShoppingResourceCommand(Base):
    __tablename__ = 'shopping_resource_command'
    __table_args__ = (
        CheckConstraint("signature ~ '^[a-f0-9]{64}$'", name='signature_valid'),
        CheckConstraint("jsonb_typeof(result) = 'object'", name='result_object'),
    )
    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), primary_key=True)
    idempotency_key: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    signature: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('now()'))


class ShoppingListPin(Base):
    __tablename__ = 'shopping_list_pin'
    __table_args__ = (
        ForeignKeyConstraint(['list_id', 'owner_id'], ['shopping_list.id', 'shopping_list.owner_id'], ondelete='CASCADE'),
    )
    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey('profile.id', ondelete='CASCADE'), primary_key=True)
    list_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
