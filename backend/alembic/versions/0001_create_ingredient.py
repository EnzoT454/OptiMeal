"""Créer le référentiel commun des ingrédients.

Revision ID: 0001_ingredients
Revises: None
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001_ingredients'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'ingredient',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('category', sa.Text(), nullable=False),
        sa.Column('aliases', postgresql.ARRAY(sa.Text()), nullable=False,
                  server_default=sa.text("'{}'::text[]")),
        sa.PrimaryKeyConstraint('id', name='pk_ingredient'),
        sa.CheckConstraint("id ~ '^ing_[a-z0-9_]+$'", name=op.f('ck_ingredient_id_format')),
        sa.CheckConstraint("btrim(name) <> ''", name=op.f('ck_ingredient_name_not_blank')),
        sa.CheckConstraint("btrim(category) <> ''", name=op.f('ck_ingredient_category_not_blank')),
        schema='public',
    )
    # Les lectures HTTP passent par FastAPI ; aucune ouverture de la Data API
    # Supabase n'est nécessaire pour cette table à ce stade.
    op.execute('ALTER TABLE public.ingredient ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.drop_table('ingredient', schema='public')
