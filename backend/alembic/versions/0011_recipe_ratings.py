"""Évaluations des recettes, sans modification des données existantes.

Revision ID: 0011_recipe_ratings
Revises: 0010_preserve_meals
"""
from alembic import op
import sqlalchemy as sa

revision = '0011_recipe_ratings'
down_revision = '0010_preserve_meals'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'recipe_rating',
        sa.Column('recipe_id', sa.Text(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('taste_score', sa.Integer(), nullable=False),
        sa.Column('reliability_score', sa.Integer(), nullable=False),
        sa.Column('ease_score', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('recipe_id', 'user_id', name='pk_recipe_rating'),
        sa.ForeignKeyConstraint(['recipe_id'], ['public.recipe.id'], ondelete='CASCADE',
                                name='fk_recipe_rating_recipe_id_recipe'),
        sa.ForeignKeyConstraint(['user_id'], ['public.profile.id'], ondelete='CASCADE',
                                name='fk_recipe_rating_user_id_profile'),
        sa.CheckConstraint('taste_score BETWEEN 1 AND 5', name=op.f('ck_recipe_rating_taste_score_range')),
        sa.CheckConstraint('reliability_score BETWEEN 1 AND 5', name=op.f('ck_recipe_rating_reliability_score_range')),
        sa.CheckConstraint('ease_score BETWEEN 1 AND 5', name=op.f('ck_recipe_rating_ease_score_range')),
        schema='public',
    )
    op.create_index('ix_recipe_rating_user_id', 'recipe_rating', ['user_id'], schema='public')
    op.execute('ALTER TABLE public.recipe_rating ENABLE ROW LEVEL SECURITY')
    # Aucune politique Data API : accès métier via FastAPI uniquement.


def downgrade() -> None:
    # Ne pas perdre silencieusement les contributions lors d'un retour de version.
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.recipe_rating) THEN
            RAISE EXCEPTION 'Retour à 0010 impossible : des évaluations existent.';
        END IF;
    END $$""")
    op.drop_index('ix_recipe_rating_user_id', table_name='recipe_rating', schema='public')
    op.drop_table('recipe_rating', schema='public')
