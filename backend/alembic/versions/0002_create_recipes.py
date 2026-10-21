"""Créer les recettes et leurs ingrédients quantifiés.

Revision ID: 0002_recipes
Revises: 0001_ingredients
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0002_recipes'
down_revision = '0001_ingredients'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'recipe',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('seed_key', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('servings', sa.Integer(), nullable=False),
        sa.Column('prep_time_minutes', sa.Integer(), nullable=False),
        sa.Column('cook_time_minutes', sa.Integer(), nullable=False),
        sa.Column('total_time_minutes', sa.Integer(), nullable=False),
        sa.Column('image_url', sa.Text(), nullable=True),
        sa.Column('instructions', postgresql.JSONB(), nullable=False),
        sa.Column('review_required', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.PrimaryKeyConstraint('id', name='pk_recipe'),
        sa.UniqueConstraint('seed_key', name='uq_recipe_seed_key'),
        sa.CheckConstraint("id ~ '^recipe_[a-z0-9_]+$'", name=op.f('ck_recipe_id_format')),
        sa.CheckConstraint("seed_key ~ '^[a-z0-9_]+$'", name=op.f('ck_recipe_seed_key_format')),
        sa.CheckConstraint("btrim(name) <> ''", name=op.f('ck_recipe_name_not_blank')),
        sa.CheckConstraint("btrim(description) <> ''", name=op.f('ck_recipe_description_not_blank')),
        sa.CheckConstraint('servings > 0', name=op.f('ck_recipe_servings_positive')),
        sa.CheckConstraint('prep_time_minutes >= 0 AND cook_time_minutes >= 0',
                           name=op.f('ck_recipe_times_nonnegative')),
        sa.CheckConstraint('total_time_minutes = prep_time_minutes + cook_time_minutes',
                           name=op.f('ck_recipe_total_time_consistent')),
        sa.CheckConstraint("jsonb_typeof(instructions) = 'array' AND instructions <> '[]'::jsonb",
                           name=op.f('ck_recipe_instructions_nonempty_array')),
        schema='public',
    )
    op.create_table(
        'recipe_ingredient',
        sa.Column('recipe_id', sa.Text(), nullable=False),
        sa.Column('ingredient_id', sa.Text(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Numeric(), nullable=False),
        sa.Column('unit', sa.Text(), nullable=False),
        sa.Column('preparation', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('recipe_id', 'ingredient_id', name='pk_recipe_ingredient'),
        sa.ForeignKeyConstraint(['recipe_id'], ['public.recipe.id'], ondelete='CASCADE',
                                name='fk_recipe_ingredient_recipe_id_recipe'),
        sa.ForeignKeyConstraint(['ingredient_id'], ['public.ingredient.id'], ondelete='RESTRICT',
                                name='fk_recipe_ingredient_ingredient_id_ingredient'),
        sa.UniqueConstraint('recipe_id', 'position', name='uq_recipe_ingredient_recipe_position'),
        sa.CheckConstraint('position > 0', name=op.f('ck_recipe_ingredient_position_positive')),
        sa.CheckConstraint("quantity > 0 AND quantity < 'Infinity'::numeric",
                           name=op.f('ck_recipe_ingredient_quantity_positive_finite')),
        sa.CheckConstraint("unit IN ('g', 'ml', 'unit')", name=op.f('ck_recipe_ingredient_unit_supported')),
        sa.CheckConstraint("unit <> 'unit' OR quantity = trunc(quantity)",
                           name=op.f('ck_recipe_ingredient_whole_units')),
        schema='public',
    )
    op.create_index('ix_recipe_ingredient_ingredient_id', 'recipe_ingredient', ['ingredient_id'], schema='public')
    op.execute('ALTER TABLE public.recipe ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE public.recipe_ingredient ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table('recipe_ingredient', schema='public')
    op.drop_table('recipe', schema='public')
