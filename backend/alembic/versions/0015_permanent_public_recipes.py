"""Conserver les recettes publiques après suppression de leur auteur."""
from alembic import op
import sqlalchemy as sa

revision = '0015_permanent_public_recipes'
down_revision = '0014_recipe_kitchen_units'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('profile', sa.Column('deletion_pending', sa.Boolean(), nullable=False, server_default=sa.text('false')), schema='public')
    op.drop_constraint(op.f('ck_recipe_ownership'), 'recipe', type_='check', schema='public')
    op.create_check_constraint(op.f('ck_recipe_ownership'), 'recipe',
                               "(owner_id IS NULL AND visibility = 'public') OR (owner_id IS NOT NULL AND seed_key IS NULL)", schema='public')
    op.execute("""CREATE FUNCTION public.preserve_public_recipes() RETURNS trigger
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
            UPDATE public.recipe SET owner_id = NULL WHERE owner_id = OLD.id AND visibility = 'public';
            RETURN OLD;
        END $$""")
    op.execute('REVOKE ALL ON FUNCTION public.preserve_public_recipes() FROM PUBLIC')
    op.execute("""CREATE TRIGGER preserve_public_recipes_before_profile_delete
        BEFORE DELETE ON public.profile FOR EACH ROW EXECUTE FUNCTION public.preserve_public_recipes()""")


def downgrade() -> None:
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.recipe WHERE owner_id IS NULL AND seed_key IS NULL) THEN
            RAISE EXCEPTION 'Retour à 0014 impossible : des recettes publiques sans auteur existent.';
        END IF;
    END $$""")
    op.execute('DROP TRIGGER preserve_public_recipes_before_profile_delete ON public.profile')
    op.execute('DROP FUNCTION public.preserve_public_recipes()')
    op.drop_constraint(op.f('ck_recipe_ownership'), 'recipe', type_='check', schema='public')
    op.create_check_constraint(op.f('ck_recipe_ownership'), 'recipe',
                               '(owner_id IS NULL AND seed_key IS NOT NULL) OR (owner_id IS NOT NULL AND seed_key IS NULL)', schema='public')
    op.drop_column('profile', 'deletion_pending', schema='public')
