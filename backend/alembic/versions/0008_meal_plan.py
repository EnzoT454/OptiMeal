"""Calendrier des repas (une ligne par repas prévu).

Revision ID: 0008_meal_plan
Revises: 0007_product_images
"""
from alembic import op
import sqlalchemy as sa

revision = '0008_meal_plan'
down_revision = '0007_product_images'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'meal_plan_entry',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('meal', sa.Text(), nullable=False),
        sa.Column('recipe_id', sa.Text(), nullable=True),
        sa.Column('free_text', sa.Text(), nullable=True),
        sa.Column('servings', sa.Integer(), nullable=False),
        sa.CheckConstraint("meal IN ('dejeuner', 'diner', 'souper', 'collation')",
                           name=op.f('ck_meal_plan_entry_meal_supported')),
        sa.CheckConstraint('servings > 0 AND servings <= 50', name=op.f('ck_meal_plan_entry_servings_range')),
        sa.CheckConstraint(
            "(recipe_id IS NOT NULL AND free_text IS NULL) OR "
            "(recipe_id IS NULL AND free_text IS NOT NULL AND btrim(free_text) <> '')",
            name=op.f('ck_meal_plan_entry_recipe_or_free_text'),
        ),
        sa.CheckConstraint('char_length(free_text) <= 80', name=op.f('ck_meal_plan_entry_free_text_length')),
        sa.ForeignKeyConstraint(['user_id'], ['public.profile.id'],
                                name=op.f('fk_meal_plan_entry_user_id_profile'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['recipe_id'], ['public.recipe.id'],
                                name=op.f('fk_meal_plan_entry_recipe_id_recipe'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_meal_plan_entry')),
        schema='public',
    )
    op.create_index(op.f('ix_meal_plan_entry_recipe_id'), 'meal_plan_entry', ['recipe_id'], schema='public')
    op.create_index('ix_meal_plan_entry_user_id_date', 'meal_plan_entry', ['user_id', 'date'], schema='public')
    # Comme les autres tables : RLS activé, seul le backend (connexion serveur) y accède.
    op.execute('ALTER TABLE public.meal_plan_entry ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_index('ix_meal_plan_entry_user_id_date', table_name='meal_plan_entry', schema='public')
    op.drop_index(op.f('ix_meal_plan_entry_recipe_id'), table_name='meal_plan_entry', schema='public')
    op.drop_table('meal_plan_entry', schema='public')