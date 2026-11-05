"""Accepter les tasses et cuillères dans les ingrédients des recettes."""
from alembic import op

revision = '0014_recipe_kitchen_units'
down_revision = '0013_rating_versions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(op.f('ck_recipe_ingredient_unit_supported'), 'recipe_ingredient', type_='check', schema='public')
    op.create_check_constraint(op.f('ck_recipe_ingredient_unit_supported'), 'recipe_ingredient',
                               "unit IN ('g', 'ml', 'unit', 'cup', 'tbsp', 'tsp')", schema='public')


def downgrade() -> None:
    # Refuser la perte ou la conversion implicite des quantités déjà enregistrées.
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.recipe_ingredient WHERE unit IN ('cup', 'tbsp', 'tsp')) THEN
            RAISE EXCEPTION 'Retour à 0013 impossible : des recettes utilisent des tasses ou cuillères.';
        END IF;
    END $$""")
    op.drop_constraint(op.f('ck_recipe_ingredient_unit_supported'), 'recipe_ingredient', type_='check', schema='public')
    op.create_check_constraint(op.f('ck_recipe_ingredient_unit_supported'), 'recipe_ingredient',
                               "unit IN ('g', 'ml', 'unit')", schema='public')
