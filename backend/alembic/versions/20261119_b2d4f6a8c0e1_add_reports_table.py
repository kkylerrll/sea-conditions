"""add reports table

Revision ID: b2d4f6a8c0e1
Revises: a1c3e5f7b9d2
Create Date: 2026-11-19 12:00:00.000000+08:00
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b2d4f6a8c0e1'
down_revision: Union[str, None] = 'a1c3e5f7b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('location_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('activity', sa.String(length=8), nullable=False),
        sa.Column('feeling', sa.String(length=8), nullable=False),
        sa.Column('visibility_m', sa.Integer(), nullable=True),
        sa.Column('note', sa.String(length=140), nullable=True),
        sa.Column('ip_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ip_hash', 'location_id', 'date', 'activity', name='uq_report_ip_loc_date_activity'),
    )
    op.create_index(op.f('ix_reports_location_id'), 'reports', ['location_id'], unique=False)
    op.create_index(op.f('ix_reports_date'), 'reports', ['date'], unique=False)
    op.create_index('ix_reports_ip_hash_created_at', 'reports', ['ip_hash', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_reports_ip_hash_created_at', table_name='reports')
    op.drop_index(op.f('ix_reports_date'), table_name='reports')
    op.drop_index(op.f('ix_reports_location_id'), table_name='reports')
    op.drop_table('reports')
