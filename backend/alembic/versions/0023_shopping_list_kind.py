"""Type immuable des nouvelles listes ; anciennes listes conservées sans réécriture.

Revision ID: 0023_shopping_list_kind
Revises: 0022_product_follows
"""
from alembic import op
import sqlalchemy as sa

revision = '0023_shopping_list_kind'
down_revision = '0022_product_follows'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('shopping_list', 'shopping_list_template'):
        op.add_column(table, sa.Column('kind', sa.Text(), nullable=True))
        op.create_check_constraint('kind_supported', table, "kind IS NULL OR kind IN ('articles', 'products')")


def downgrade():
    for table in ('shopping_list_template', 'shopping_list'):
        op.drop_constraint('kind_supported', table, type_='check')
        op.drop_column(table, 'kind')
