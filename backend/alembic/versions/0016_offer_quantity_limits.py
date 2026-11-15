"""Prix promotionnel pour les premières unités, puis prix après limite."""
from alembic import op
import sqlalchemy as sa

revision = '0016_offer_quantity_limits'
down_revision = '0015_permanent_public_recipes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('product_offer', sa.Column('quantity_limit', sa.Integer(), nullable=True), schema='public')
    op.add_column('product_offer', sa.Column('price_after_limit', sa.Numeric(), nullable=True), schema='public')
    op.create_check_constraint(
        op.f('ck_product_offer_quantity_limit_pricing'), 'product_offer',
        '(quantity_limit IS NULL AND price_after_limit IS NULL) OR '
        '(quantity_limit IS NOT NULL AND quantity_limit > 0 AND price_after_limit IS NOT NULL '
        'AND promo_price IS NOT NULL AND is_promotion IS TRUE '
        "AND price_after_limit >= promo_price AND price_after_limit < 'Infinity'::numeric)",
        schema='public',
    )


def downgrade() -> None:
    op.drop_constraint(op.f('ck_product_offer_quantity_limit_pricing'), 'product_offer', type_='check', schema='public')
    op.drop_column('product_offer', 'price_after_limit', schema='public')
    op.drop_column('product_offer', 'quantity_limit', schema='public')
