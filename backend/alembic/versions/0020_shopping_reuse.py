"""Modèles privés, exclusions futures et origine des copies indépendantes."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0020_shopping_reuse'
down_revision = '0019_shopping_courses'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('shopping_list', sa.Column('origin', postgresql.JSONB(), nullable=True), schema='public')
    op.create_table('shopping_list_template',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('owner_id', sa.Uuid(), sa.ForeignKey('public.profile.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.Text(), nullable=False), sa.Column('icon', sa.Text(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False), sa.Column('items', postgresql.JSONB(), nullable=False),
        sa.Column('deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('length(btrim(name)) BETWEEN 1 AND 120', name='name_valid'),
        sa.CheckConstraint("icon IN ('basket', 'cart', 'leaf', 'restaurant', 'home')", name='icon_supported'),
        sa.CheckConstraint('revision > 0', name='revision_positive'),
        sa.CheckConstraint("jsonb_typeof(items) = 'array'", name='items_array'),
        sa.CheckConstraint('updated_at >= created_at', name='timestamps_ordered'), schema='public')
    op.create_index('ix_shopping_list_template_owner_updated', 'shopping_list_template', ['owner_id', 'updated_at'], schema='public')
    op.create_table('shopping_list_exclusion',
        sa.Column('owner_id', sa.Uuid(), sa.ForeignKey('public.profile.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('ingredient_id', sa.Text(), sa.ForeignKey('public.ingredient.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False), schema='public')
    op.create_table('shopping_resource_command',
        sa.Column('owner_id', sa.Uuid(), sa.ForeignKey('public.profile.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('idempotency_key', sa.Uuid(), primary_key=True),
        sa.Column('signature', sa.Text(), nullable=False), sa.Column('result', postgresql.JSONB(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint("signature ~ '^[a-f0-9]{64}$'", name='signature_valid'),
        sa.CheckConstraint("jsonb_typeof(result) = 'object'", name='result_object'), schema='public')
    for table in ('shopping_list_template', 'shopping_list_exclusion', 'shopping_resource_command'):
        op.execute(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.shopping_list_template) OR
           EXISTS (SELECT 1 FROM public.shopping_list_exclusion) OR
           EXISTS (SELECT 1 FROM public.shopping_resource_command) OR
           EXISTS (SELECT 1 FROM public.shopping_list WHERE origin IS NOT NULL) THEN
            RAISE EXCEPTION 'Retour impossible : modèles, exclusions ou copies enregistrés.';
        END IF;
    END $$""")
    for table in ('shopping_resource_command', 'shopping_list_exclusion', 'shopping_list_template'):
        op.drop_table(table, schema='public')
    op.drop_column('shopping_list', 'origin', schema='public')
