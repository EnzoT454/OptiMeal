"""Visibilité volontaire des recettes personnelles.

Revision ID: 0009_recipe_visibility
Revises: 0008_meal_plan
"""
from alembic import op
import sqlalchemy as sa

revision = '0009_recipe_visibility'
down_revision = '0008_meal_plan'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('recipe', sa.Column('visibility', sa.Text(), nullable=False,
                                    server_default=sa.text("'private'")), schema='public')
    op.add_column('recipe', sa.Column('published_at', sa.DateTime(timezone=True), nullable=True), schema='public')
    op.execute("UPDATE public.recipe SET visibility = 'public' WHERE owner_id IS NULL")
    op.create_check_constraint(op.f('ck_recipe_visibility_supported'), 'recipe',
                               "visibility IN ('private', 'public')", schema='public')
    op.create_check_constraint(op.f('ck_recipe_public_seed'), 'recipe',
                               "owner_id IS NOT NULL OR visibility = 'public'", schema='public')
    op.create_check_constraint(op.f('ck_recipe_publication_consistent'), 'recipe',
                               "(visibility = 'private' AND published_at IS NULL) OR "
                               "(visibility = 'public' AND (owner_id IS NULL OR published_at IS NOT NULL))",
                               schema='public')
    op.create_index('ix_recipe_visibility', 'recipe', ['visibility'], schema='public')


def downgrade() -> None:
    op.drop_index('ix_recipe_visibility', table_name='recipe', schema='public')
    for name in ('publication_consistent', 'public_seed', 'visibility_supported'):
        op.drop_constraint(op.f('ck_recipe_' + name), 'recipe', type_='check', schema='public')
    op.drop_column('recipe', 'published_at', schema='public')
    op.drop_column('recipe', 'visibility', schema='public')
