"""Difficulté facultative et étiquettes des recettes.

Revision ID: 0004_recipe_metadata
Revises: 0003_accounts
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0004_recipe_metadata'
down_revision = '0003_accounts'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('recipe', sa.Column('difficulty', sa.Text(), nullable=True), schema='public')
    op.add_column('recipe', sa.Column('tags', postgresql.ARRAY(sa.Text()), nullable=False,
                                    server_default=sa.text("'{}'::text[]")), schema='public')
    op.create_check_constraint(op.f('ck_recipe_difficulty_supported'), 'recipe',
                               "difficulty IN ('easy', 'medium', 'hard')", schema='public')
    op.create_check_constraint(op.f('ck_recipe_tags_valid'), 'recipe',
                               'cardinality(tags) <= 10 AND array_position(tags, NULL) IS NULL', schema='public')


def downgrade() -> None:
    op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.recipe WHERE difficulty IS NOT NULL OR cardinality(tags) > 0) THEN RAISE EXCEPTION 'Recipe metadata exists'; END IF; END $$")
    op.drop_constraint(op.f('ck_recipe_tags_valid'), 'recipe', type_='check', schema='public')
    op.drop_constraint(op.f('ck_recipe_difficulty_supported'), 'recipe', type_='check', schema='public')
    op.drop_column('recipe', 'tags', schema='public')
    op.drop_column('recipe', 'difficulty', schema='public')
