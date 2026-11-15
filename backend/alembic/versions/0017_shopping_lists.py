"""Listes privées, quantités et historique transactionnel

Revision ID: 0017_shopping_lists
Revises: 0016_offer_quantity_limits
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0017_shopping_lists'
down_revision = '0016_offer_quantity_limits'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('shopping_list',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('source', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('purchase_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("(source = 'manual' AND start_date IS NULL AND end_date IS NULL) OR (source = 'calendar' AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date)", name=op.f('ck_shopping_list_period_coherent')),
        sa.CheckConstraint("source IN ('manual', 'calendar')", name=op.f('ck_shopping_list_source_supported')),
        sa.CheckConstraint("status IN ('draft', 'active', 'completed', 'archived')", name=op.f('ck_shopping_list_status_supported')),
        sa.CheckConstraint('length(btrim(name)) BETWEEN 1 AND 120', name=op.f('ck_shopping_list_name_valid')),
        sa.CheckConstraint('revision > 0', name=op.f('ck_shopping_list_revision_positive')),
        sa.CheckConstraint('updated_at >= created_at', name=op.f('ck_shopping_list_timestamps_ordered')),
        sa.ForeignKeyConstraint(['owner_id'], ['public.profile.id'], name=op.f('fk_shopping_list_owner_id_profile'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_shopping_list')),
        sa.UniqueConstraint('id', 'owner_id', name='uq_shopping_list_id_owner'),
        schema='public',
    )
    op.create_index('ix_shopping_list_owner_status_updated', 'shopping_list', ['owner_id', 'status', 'updated_at'], unique=False, schema='public')
    op.create_table('shopping_list_command',
        sa.Column('owner_id', sa.Uuid(), nullable=False),
        sa.Column('idempotency_key', sa.Uuid(), nullable=False),
        sa.Column('list_id', sa.Uuid(), nullable=False),
        sa.Column('signature', sa.Text(), nullable=False),
        sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("(jsonb_typeof(result) = 'object' AND result ?& ARRAY['id', 'revision'] AND result->>'id' = list_id::text) IS TRUE", name=op.f('ck_shopping_list_command_result_identity')),
        sa.CheckConstraint("signature ~ '^[a-f0-9]{64}$'", name=op.f('ck_shopping_list_command_signature_valid')),
        sa.ForeignKeyConstraint(['list_id', 'owner_id'], ['public.shopping_list.id', 'public.shopping_list.owner_id'], name='fk_shopping_list_command_owned_list', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['owner_id'], ['public.profile.id'], name=op.f('fk_shopping_list_command_owner_id_profile'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('owner_id', 'idempotency_key', name=op.f('pk_shopping_list_command')),
        schema='public',
    )
    op.create_index('ix_shopping_list_command_list_id', 'shopping_list_command', ['list_id'], unique=False, schema='public')
    op.create_table('shopping_list_item',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('list_id', sa.Uuid(), nullable=False),
        sa.Column('ingredient_id', sa.Text(), nullable=True),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('category', sa.Text(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('need_revision', sa.Integer(), nullable=False),
        sa.Column('removed', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('owned_unquantified_need_revision', sa.Integer(), nullable=True),
        sa.CheckConstraint('length(btrim(category)) BETWEEN 1 AND 120', name=op.f('ck_shopping_list_item_category_valid')),
        sa.CheckConstraint('length(btrim(name)) BETWEEN 1 AND 120', name=op.f('ck_shopping_list_item_name_valid')),
        sa.CheckConstraint('owned_unquantified_need_revision IS NULL OR (owned_unquantified_need_revision > 0 AND owned_unquantified_need_revision <= need_revision)', name=op.f('ck_shopping_list_item_owned_revision_valid')),
        sa.CheckConstraint('position > 0 AND need_revision > 0', name=op.f('ck_shopping_list_item_positive_versions')),
        sa.ForeignKeyConstraint(['ingredient_id'], ['public.ingredient.id'], name=op.f('fk_shopping_list_item_ingredient_id_ingredient'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['list_id'], ['public.shopping_list.id'], name=op.f('fk_shopping_list_item_list_id_shopping_list'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_shopping_list_item')),
        sa.UniqueConstraint('list_id', 'id', name='uq_shopping_list_item_list_id_id'),
        sa.UniqueConstraint('list_id', 'position', name='uq_shopping_list_item_list_id_position'),
        schema='public',
    )
    op.create_table('shopping_list_revision',
        sa.Column('list_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('command_id', sa.Uuid(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.CheckConstraint("(jsonb_typeof(snapshot) = 'object' AND snapshot ?& ARRAY['id', 'revision'] AND snapshot->>'id' = list_id::text AND (snapshot->>'revision')::integer = revision) IS TRUE", name=op.f('ck_shopping_list_revision_snapshot_identity')),
        sa.CheckConstraint('revision > 0', name=op.f('ck_shopping_list_revision_revision_positive')),
        sa.ForeignKeyConstraint(['list_id'], ['public.shopping_list.id'], name=op.f('fk_shopping_list_revision_list_id_shopping_list'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('list_id', 'revision', name=op.f('pk_shopping_list_revision')),
        sa.UniqueConstraint('list_id', 'command_id', name='uq_shopping_list_revision_list_command'),
        schema='public',
    )
    op.create_table('shopping_list_contribution',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('item_id', sa.Uuid(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.CheckConstraint("jsonb_typeof(data) = 'object'", name=op.f('ck_shopping_list_contribution_data_object')),
        sa.CheckConstraint('position > 0', name=op.f('ck_shopping_list_contribution_position_positive')),
        sa.ForeignKeyConstraint(['item_id'], ['public.shopping_list_item.id'], name=op.f('fk_shopping_list_contribution_item_id_shopping_list_item'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_shopping_list_contribution')),
        sa.UniqueConstraint('item_id', 'position', name='uq_shopping_list_contribution_item_position'),
        schema='public',
    )
    op.create_table('shopping_list_purchase',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('list_id', sa.Uuid(), nullable=False),
        sa.Column('item_id', sa.Uuid(), nullable=False),
        sa.Column('purchased', sa.Boolean(), nullable=False),
        sa.Column('confirmed_need_revision', sa.Integer(), nullable=True),
        sa.CheckConstraint('confirmed_need_revision IS NULL OR (confirmed_need_revision > 0 AND purchased)', name=op.f('ck_shopping_list_purchase_confirmed_revision_valid')),
        sa.ForeignKeyConstraint(['list_id', 'item_id'], ['public.shopping_list_item.list_id', 'public.shopping_list_item.id'], name='fk_shopping_list_purchase_item_in_list', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_shopping_list_purchase')),
        sa.UniqueConstraint('item_id', name='uq_shopping_list_purchase_item_id'),
        schema='public',
    )
    op.create_index('ix_shopping_list_purchase_list_id', 'shopping_list_purchase', ['list_id'], unique=False, schema='public')
    op.create_table('shopping_list_quantity',
        sa.Column('item_id', sa.Uuid(), nullable=False),
        sa.Column('kind', sa.Text(), nullable=False),
        sa.Column('unit', sa.Text(), nullable=False),
        sa.Column('amount', sa.Numeric(), nullable=False),
        sa.CheckConstraint("amount > 0 AND amount < 'Infinity'::numeric", name=op.f('ck_shopping_list_quantity_amount_finite_positive')),
        sa.CheckConstraint("kind IN ('required', 'owned')", name=op.f('ck_shopping_list_quantity_kind_supported')),
        sa.CheckConstraint("unit IN ('g', 'ml', 'unit')", name=op.f('ck_shopping_list_quantity_unit_supported')),
        sa.ForeignKeyConstraint(['item_id'], ['public.shopping_list_item.id'], name=op.f('fk_shopping_list_quantity_item_id_shopping_list_item'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('item_id', 'kind', 'unit', name=op.f('pk_shopping_list_quantity')),
        schema='public',
    )
    op.create_table('shopping_list_purchase_quantity',
        sa.Column('purchase_id', sa.Uuid(), nullable=False),
        sa.Column('unit', sa.Text(), nullable=False),
        sa.Column('amount', sa.Numeric(), nullable=False),
        sa.CheckConstraint("amount > 0 AND amount < 'Infinity'::numeric", name=op.f('ck_shopping_list_purchase_quantity_amount_finite_positive')),
        sa.CheckConstraint("unit IN ('g', 'ml', 'unit')", name=op.f('ck_shopping_list_purchase_quantity_unit_supported')),
        sa.ForeignKeyConstraint(['purchase_id'], ['public.shopping_list_purchase.id'], name=op.f('fk_shopping_list_purchase_quantity_purchase_id_shopping_list_purchase'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('purchase_id', 'unit', name=op.f('pk_shopping_list_purchase_quantity')),
        schema='public',
    )

    # Les tables métier ne sont pas accessibles directement depuis le mobile.
    for table in ('shopping_list', 'shopping_list_item', 'shopping_list_quantity',
                  'shopping_list_contribution', 'shopping_list_purchase',
                  'shopping_list_purchase_quantity', 'shopping_list_revision', 'shopping_list_command'):
        op.execute(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY')
    op.execute("""CREATE FUNCTION public.shopping_history_immutable() RETURNS trigger
        LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN
            RAISE EXCEPTION 'Historique de liste immuable' USING ERRCODE = '23514';
        END $$""")
    op.execute('REVOKE ALL ON FUNCTION public.shopping_history_immutable() FROM PUBLIC')
    for table in ('shopping_list_revision', 'shopping_list_command'):
        op.execute(f'''CREATE TRIGGER {table}_immutable BEFORE UPDATE ON public.{table}
            FOR EACH ROW EXECUTE FUNCTION public.shopping_history_immutable()''')


def downgrade() -> None:
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.shopping_list) THEN
            RAISE EXCEPTION 'Retour à 0016 impossible : des listes existent.';
        END IF;
    END $$""")
    op.drop_table('shopping_list_purchase_quantity', schema='public')
    op.drop_table('shopping_list_quantity', schema='public')
    op.drop_index('ix_shopping_list_purchase_list_id', table_name='shopping_list_purchase', schema='public')
    op.drop_table('shopping_list_purchase', schema='public')
    op.drop_table('shopping_list_contribution', schema='public')
    op.drop_table('shopping_list_revision', schema='public')
    op.drop_table('shopping_list_item', schema='public')
    op.drop_index('ix_shopping_list_command_list_id', table_name='shopping_list_command', schema='public')
    op.drop_table('shopping_list_command', schema='public')
    op.drop_index('ix_shopping_list_owner_status_updated', table_name='shopping_list', schema='public')
    op.drop_table('shopping_list', schema='public')
    op.execute('DROP FUNCTION public.shopping_history_immutable()')
