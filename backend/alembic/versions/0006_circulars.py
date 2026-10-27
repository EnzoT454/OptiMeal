"""Circulaire de la semaine de chaque magasin (pages en images dans Storage).

Revision ID: 0006_circulars
Revises: 0005_catalog_offers
"""
from alembic import op
import sqlalchemy as sa

revision = '0006_circulars'
down_revision = '0005_catalog_offers'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'circular',
        sa.Column('retailer', sa.Text(), nullable=False),
        sa.Column('valid_from', sa.Date(), nullable=False),
        sa.Column('valid_to', sa.Date(), nullable=False),
        sa.Column('page_count', sa.Integer(), nullable=False),
        sa.Column('storage_prefix', sa.Text(), nullable=False),
        sa.Column('imported_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('retailer', name='pk_circular'),
        sa.CheckConstraint("retailer IN ('maxi', 'metro', 'superc')", name=op.f('ck_circular_retailer_supported')),
        sa.CheckConstraint('valid_to >= valid_from', name=op.f('ck_circular_validity_ordered')),
        sa.CheckConstraint('page_count > 0', name=op.f('ck_circular_page_count_positive')),
        sa.CheckConstraint("btrim(storage_prefix) <> ''", name=op.f('ck_circular_storage_prefix_not_blank')),
        schema='public',
    )
    # Comme les autres tables : lecture par FastAPI uniquement, pas d'accès direct du mobile.
    op.execute('ALTER TABLE public.circular ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table('circular', schema='public')