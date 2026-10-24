"""Catégories et offres des magasins (page Promos).

Revision ID: 0005_catalog_offers
Revises: 0004_recipe_metadata
"""
from alembic import op
import sqlalchemy as sa

revision = '0005_catalog_offers'
down_revision = '0004_recipe_metadata'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'category',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_category'),
        sa.UniqueConstraint('name', name='uq_category_name'),
        sa.CheckConstraint("btrim(name) <> ''", name=op.f('ck_category_name_not_blank')),
        schema='public',
    )
    op.create_table(
        'product_offer',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('ingredient_id', sa.Text(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('retailer', sa.Text(), nullable=False),
        sa.Column('store_id', sa.Text(), nullable=True),
        sa.Column('external_product_id', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('price', sa.Numeric(), nullable=True),
        sa.Column('promo_price', sa.Numeric(), nullable=True),
        sa.Column('currency', sa.Text(), server_default=sa.text("'CAD'"), nullable=False),
        sa.Column('unit', sa.Text(), nullable=True),
        sa.Column('quantity', sa.Numeric(), nullable=True),
        sa.Column('valid_from', sa.Date(), nullable=True),
        sa.Column('valid_to', sa.Date(), nullable=True),
        sa.Column('retrieved_at', sa.Date(), nullable=True),
        sa.Column('is_promotion', sa.Boolean(), nullable=True),
        sa.Column('source', sa.Text(), nullable=False),
        sa.Column('url', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_product_offer'),
        sa.ForeignKeyConstraint(['ingredient_id'], ['public.ingredient.id'],
                                name='fk_product_offer_ingredient_id_ingredient'),
        sa.ForeignKeyConstraint(['category_id'], ['public.category.id'],
                                name='fk_product_offer_category_id_category'),
        sa.CheckConstraint("retailer IN ('maxi', 'metro', 'superc')", name=op.f('ck_product_offer_retailer_supported')),
        sa.CheckConstraint("currency = 'CAD'", name=op.f('ck_product_offer_currency_cad')),
        sa.CheckConstraint('price IS NULL OR price >= 0', name=op.f('ck_product_offer_price_not_negative')),
        sa.CheckConstraint('promo_price IS NULL OR promo_price >= 0',
                           name=op.f('ck_product_offer_promo_price_not_negative')),
        sa.CheckConstraint('quantity IS NULL OR quantity > 0', name=op.f('ck_product_offer_quantity_positive')),
        sa.CheckConstraint('valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from',
                           name=op.f('ck_product_offer_validity_ordered')),
        sa.CheckConstraint('position > 0', name=op.f('ck_product_offer_position_positive')),
        schema='public',
    )
    op.create_index(op.f('ix_product_offer_ingredient_id'), 'product_offer', ['ingredient_id'], schema='public')
    # Comme les autres tables : lecture par FastAPI uniquement, pas d'accès direct du mobile.
    op.execute('ALTER TABLE public.category ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE public.product_offer ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index(op.f('ix_product_offer_ingredient_id'), table_name='product_offer', schema='public')
    op.drop_table('product_offer', schema='public')
    op.drop_table('category', schema='public')