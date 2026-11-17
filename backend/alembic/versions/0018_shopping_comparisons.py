"""Simulations privées, choix manuels et répartition commerciale enregistrée."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0018_shopping_comparisons'
down_revision = '0017_shopping_lists'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('shopping_list_comparison',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('list_id', sa.Uuid(), nullable=False),
        sa.Column('data', postgresql.JSONB(), nullable=False),
        sa.ForeignKeyConstraint(['list_id'], ['public.shopping_list.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('id', 'list_id', name='uq_shopping_list_comparison_id_list'),
        sa.CheckConstraint("jsonb_typeof(data) = 'object'", name='data_object'), schema='public')
    op.create_index('ix_shopping_list_comparison_list_id', 'shopping_list_comparison', ['list_id'], schema='public')
    op.create_table('shopping_list_choice',
        sa.Column('item_id', sa.Uuid(), primary_key=True),
        sa.Column('list_id', sa.Uuid(), nullable=False),
        sa.Column('product_id', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['list_id', 'item_id'], ['public.shopping_list_item.list_id', 'public.shopping_list_item.id'],
            ondelete='CASCADE', name='fk_shopping_list_choice_item_in_list'),
        sa.CheckConstraint('length(product_id) BETWEEN 1 AND 512', name='product_id_valid'), schema='public')
    op.create_index('ix_shopping_list_choice_list_id', 'shopping_list_choice', ['list_id'], schema='public')
    op.create_table('shopping_list_assignment',
        sa.Column('list_id', sa.Uuid(), primary_key=True),
        sa.Column('comparison_id', sa.Uuid(), nullable=False),
        sa.Column('data', postgresql.JSONB(), nullable=False),
        sa.ForeignKeyConstraint(['list_id'], ['public.shopping_list.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['comparison_id', 'list_id'], ['public.shopping_list_comparison.id', 'public.shopping_list_comparison.list_id'],
            ondelete='CASCADE', name='fk_shopping_list_assignment_comparison_in_list'),
        sa.CheckConstraint("jsonb_typeof(data) = 'object'", name='data_object'), schema='public')
    for table in ('shopping_list_comparison', 'shopping_list_choice', 'shopping_list_assignment'):
        op.execute(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY')
    op.execute('''CREATE TRIGGER shopping_list_comparison_immutable BEFORE UPDATE ON public.shopping_list_comparison
        FOR EACH ROW EXECUTE FUNCTION public.shopping_history_immutable()''')


def downgrade():
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.shopping_list_assignment) OR
           EXISTS (SELECT 1 FROM public.shopping_list_choice) THEN
            RAISE EXCEPTION 'Retour impossible : des choix ou répartitions sont enregistrés.';
        END IF;
    END $$""")
    op.drop_table('shopping_list_assignment', schema='public')
    op.drop_table('shopping_list_choice', schema='public')
    op.drop_table('shopping_list_comparison', schema='public')
