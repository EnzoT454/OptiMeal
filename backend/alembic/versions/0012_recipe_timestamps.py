"""Dates des recettes pour les tris, sans inventer l'âge des anciennes lignes."""
from alembic import op
import sqlalchemy as sa

revision = '0012_recipe_timestamps'
down_revision = '0011_recipe_ratings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in ('created_at', 'updated_at'):
        # Ajouter sans défaut conserve NULL pour les lignes déjà présentes.
        op.add_column('recipe', sa.Column(column, sa.DateTime(timezone=True), nullable=True), schema='public')
        op.alter_column('recipe', column, server_default=sa.func.now(), schema='public')
    op.create_index('ix_recipe_updated_at', 'recipe', ['updated_at'], schema='public')


def downgrade() -> None:
    # Les recettes et évaluations sont conservées ; leurs dates sont perdues.
    op.drop_index('ix_recipe_updated_at', table_name='recipe', schema='public')
    op.drop_column('recipe', 'updated_at', schema='public')
    op.drop_column('recipe', 'created_at', schema='public')
