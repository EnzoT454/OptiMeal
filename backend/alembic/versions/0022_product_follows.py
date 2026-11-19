"""Produits suivis (la cloche dans Promos) : une ligne par utilisateur et par produit.

Revision ID: 0022_product_follows
Revises: 0021_shopping_list_pin
"""
from alembic import op
import sqlalchemy as sa

revision = '0022_product_follows'
down_revision = '0021_shopping_list_pin'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'product_follow',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        # Identifiant stable du produit (enseigne + magasin + référence marchand).
        # Pas de clé étrangère : le catalogue change chaque semaine, le suivi doit survivre.
        sa.Column('product_id', sa.Text(), nullable=False),
        sa.Column('retailer', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('since', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("retailer IN ('maxi', 'metro', 'superc')",
                           name=op.f('ck_product_follow_retailer_supported')),
        sa.CheckConstraint("char_length(product_id) BETWEEN 1 AND 200",
                           name=op.f('ck_product_follow_product_id_length')),
        sa.CheckConstraint("btrim(name) <> '' AND char_length(name) <= 200",
                           name=op.f('ck_product_follow_name_length')),
        sa.ForeignKeyConstraint(['user_id'], ['public.profile.id'],
                                name=op.f('fk_product_follow_user_id_profile'), ondelete='CASCADE'),
        # Un même produit ne peut être suivi qu'une fois par utilisateur.
        sa.PrimaryKeyConstraint('user_id', 'product_id', name=op.f('pk_product_follow')),
        schema='public',
    )
    # Comme les autres tables : RLS activé, seul le backend (connexion serveur) y accède.
    op.execute('ALTER TABLE public.product_follow ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    # Même prudence que 0021 : on ne supprime pas des suivis enregistrés sans le vouloir.
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.product_follow) THEN
            RAISE EXCEPTION 'Retour impossible : produits suivis enregistrés.';
        END IF;
    END $$""")
    op.drop_table('product_follow', schema='public')