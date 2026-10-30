"""Photo de chaque produit (lien direct vers la photo du magasin).

Revision ID: 0007_product_images
Revises: 0006_circulars
"""
from alembic import op
import sqlalchemy as sa

revision = '0007_product_images'
down_revision = '0006_circulars'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Colonnes facultatives : les lignes existantes restent valides (NULL) jusqu'au prochain import.
    op.add_column('product_offer', sa.Column('image_url', sa.Text(), nullable=True), schema='public')
    op.add_column('product_offer', sa.Column('image_source', sa.Text(), nullable=True), schema='public')
    op.create_check_constraint(
        op.f('ck_product_offer_image_url_https'), 'product_offer',
        "image_url IS NULL OR image_url LIKE 'https://%'", schema='public',
    )


def downgrade() -> None:
    op.drop_constraint(op.f('ck_product_offer_image_url_https'), 'product_offer', type_='check', schema='public')
    op.drop_column('product_offer', 'image_source', schema='public')
    op.drop_column('product_offer', 'image_url', schema='public')