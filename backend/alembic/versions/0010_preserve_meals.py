"""Conserver les repas dont la recette a été supprimée.

Revision ID: 0010_preserve_meals
Revises: 0009_recipe_visibility
"""
from alembic import op

revision = '0010_preserve_meals'
down_revision = '0009_recipe_visibility'
branch_labels = None
depends_on = None


def replace_constraints(ondelete: str, *, preserve: bool) -> None:
    op.drop_constraint(op.f('fk_meal_plan_entry_recipe_id_recipe'), 'meal_plan_entry', type_='foreignkey', schema='public')
    op.create_foreign_key(op.f('fk_meal_plan_entry_recipe_id_recipe'), 'meal_plan_entry', 'recipe',
                          ['recipe_id'], ['id'], source_schema='public', referent_schema='public', ondelete=ondelete)
    for name in ('recipe_or_free_text', 'leftover_needs_recipe'):
        op.drop_constraint(op.f('ck_meal_plan_entry_' + name), 'meal_plan_entry', type_='check', schema='public')
    recipe_or_text = ("(recipe_id IS NOT NULL AND free_text IS NULL) OR "
                      "(recipe_id IS NULL AND free_text IS NOT NULL AND btrim(free_text) <> '')")
    if preserve:
        recipe_or_text += ' OR (recipe_id IS NULL AND free_text IS NULL)'
    op.create_check_constraint(op.f('ck_meal_plan_entry_recipe_or_free_text'), 'meal_plan_entry', recipe_or_text, schema='public')
    op.create_check_constraint(op.f('ck_meal_plan_entry_leftover_needs_recipe'), 'meal_plan_entry',
                               'NOT is_leftover OR free_text IS NULL' if preserve else 'NOT is_leftover OR recipe_id IS NOT NULL',
                               schema='public')


def upgrade() -> None:
    replace_constraints('SET NULL', preserve=True)


def downgrade() -> None:
    # L'ancien schéma ne peut représenter un repas sans recette ni note.
    # Refuser plutôt que supprimer silencieusement ces repas.
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.meal_plan_entry WHERE recipe_id IS NULL AND free_text IS NULL) THEN
            RAISE EXCEPTION 'Retour à 0009 impossible : des repas référencent une recette supprimée.';
        END IF;
    END $$""")
    replace_constraints('CASCADE', preserve=False)
