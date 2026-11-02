"""Conserver les notes de chaque version du contenu évalué."""
from alembic import op
import sqlalchemy as sa

revision = '0013_rating_versions'
down_revision = '0012_recipe_timestamps'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('recipe', sa.Column('content_version', sa.Integer(), nullable=False, server_default=sa.text('1')), schema='public')
    op.create_check_constraint(op.f('ck_recipe_content_version_positive'), 'recipe', 'content_version > 0', schema='public')
    op.add_column('recipe_rating', sa.Column('recipe_version', sa.Integer(), nullable=False, server_default=sa.text('1')), schema='public')
    op.create_check_constraint(op.f('ck_recipe_rating_recipe_version_positive'), 'recipe_rating', 'recipe_version > 0', schema='public')
    op.drop_constraint('pk_recipe_rating', 'recipe_rating', type_='primary', schema='public')
    op.create_primary_key('pk_recipe_rating', 'recipe_rating', ['recipe_id', 'user_id', 'recipe_version'], schema='public')


def downgrade() -> None:
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.recipe WHERE content_version > 1)
           OR EXISTS (SELECT 1 FROM public.recipe_rating WHERE recipe_version > 1) THEN
            RAISE EXCEPTION 'Retour à 0012 impossible : des versions de notation existent.';
        END IF;
    END $$""")
    op.drop_constraint('pk_recipe_rating', 'recipe_rating', type_='primary', schema='public')
    op.create_primary_key('pk_recipe_rating', 'recipe_rating', ['recipe_id', 'user_id'], schema='public')
    op.drop_constraint(op.f('ck_recipe_rating_recipe_version_positive'), 'recipe_rating', type_='check', schema='public')
    op.drop_column('recipe_rating', 'recipe_version', schema='public')
    op.drop_constraint(op.f('ck_recipe_content_version_positive'), 'recipe', type_='check', schema='public')
    op.drop_column('recipe', 'content_version', schema='public')
