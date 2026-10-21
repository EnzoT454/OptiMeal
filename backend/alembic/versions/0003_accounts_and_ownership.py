"""Profils Supabase, recettes personnelles et favoris.

Revision ID: 0003_accounts
Revises: 0002_recipes
"""
from alembic import op
import sqlalchemy as sa

revision = '0003_accounts'
down_revision = '0002_recipes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'profile',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('display_name', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id', name='pk_profile'),
        sa.ForeignKeyConstraint(['id'], ['auth.users.id'], ondelete='CASCADE', name='fk_profile_id_users'),
        sa.CheckConstraint('display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 80',
                           name=op.f('ck_profile_display_name_valid')),
        schema='public',
    )
    op.add_column('recipe', sa.Column('owner_id', sa.Uuid(), nullable=True), schema='public')
    op.alter_column('recipe', 'seed_key', existing_type=sa.Text(), nullable=True, schema='public')
    op.create_foreign_key('fk_recipe_owner_id_profile', 'recipe', 'profile', ['owner_id'], ['id'],
                          source_schema='public', referent_schema='public', ondelete='CASCADE')
    op.create_check_constraint(op.f('ck_recipe_ownership'), 'recipe',
        '(owner_id IS NULL AND seed_key IS NOT NULL) OR (owner_id IS NOT NULL AND seed_key IS NULL)', schema='public')
    op.create_index('ix_recipe_owner_id', 'recipe', ['owner_id'], schema='public')
    op.create_table(
        'favorite',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('recipe_id', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('user_id', 'recipe_id', name='pk_favorite'),
        sa.ForeignKeyConstraint(['user_id'], ['public.profile.id'], ondelete='CASCADE', name='fk_favorite_user_id_profile'),
        sa.ForeignKeyConstraint(['recipe_id'], ['public.recipe.id'], ondelete='CASCADE', name='fk_favorite_recipe_id_recipe'),
        schema='public',
    )
    op.create_index('ix_favorite_recipe_id', 'favorite', ['recipe_id'], schema='public')
    for table in ('profile', 'favorite'):
        op.execute(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY')
    # Tout accès métier passe par FastAPI, qui vérifie l’identité et le propriétaire.
    # Aucune politique Data API n’est ouverte aux clients mobiles.


def downgrade() -> None:
    # Refuser de perdre des recettes personnelles lors d’un retour de version.
    op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.recipe WHERE owner_id IS NOT NULL) THEN RAISE EXCEPTION 'Personal recipes exist'; END IF; END $$")
    op.drop_table('favorite', schema='public')
    op.drop_index('ix_recipe_owner_id', table_name='recipe', schema='public')
    op.drop_constraint(op.f('ck_recipe_ownership'), 'recipe', type_='check', schema='public')
    op.drop_constraint('fk_recipe_owner_id_profile', 'recipe', type_='foreignkey', schema='public')
    op.drop_column('recipe', 'owner_id', schema='public')
    op.alter_column('recipe', 'seed_key', existing_type=sa.Text(), nullable=False, schema='public')
    op.drop_table('profile', schema='public')
