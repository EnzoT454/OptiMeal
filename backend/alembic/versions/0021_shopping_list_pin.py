"""Liste épinglée privée, une seule par compte."""
from alembic import op
import sqlalchemy as sa

revision = '0021_shopping_list_pin'
down_revision = '0020_shopping_reuse'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('shopping_list_pin',
        sa.Column('owner_id', sa.Uuid(), sa.ForeignKey('public.profile.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('list_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['list_id', 'owner_id'], ['public.shopping_list.id', 'public.shopping_list.owner_id'], ondelete='CASCADE'),
        schema='public')
    op.execute('ALTER TABLE public.shopping_list_pin ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.shopping_list_pin) THEN
            RAISE EXCEPTION 'Retour impossible : liste épinglée enregistrée.';
        END IF;
    END $$""")
    op.drop_table('shopping_list_pin', schema='public')
