"""Achats produits et couvertures figés pendant les courses."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0019_shopping_courses'
down_revision = '0018_shopping_comparisons'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('shopping_list_product_purchase',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('list_id', sa.Uuid(), nullable=False),
        sa.Column('comparison_id', sa.Uuid(), nullable=False),
        sa.Column('data', postgresql.JSONB(), nullable=False),
        sa.ForeignKeyConstraint(['list_id'], ['public.shopping_list.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['comparison_id', 'list_id'],
            ['public.shopping_list_comparison.id', 'public.shopping_list_comparison.list_id'],
            ondelete='CASCADE', name='fk_shopping_product_purchase_comparison_in_list'),
        sa.CheckConstraint("jsonb_typeof(data) = 'object'", name='data_object'), schema='public')
    op.create_index('ix_shopping_list_product_purchase_list_id', 'shopping_list_product_purchase', ['list_id'], schema='public')
    op.execute('ALTER TABLE public.shopping_list_product_purchase ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.shopping_list_product_purchase) THEN
            RAISE EXCEPTION 'Retour impossible : des achats produit sont enregistrés.';
        END IF;
    END $$""")
    op.drop_table('shopping_list_product_purchase', schema='public')
