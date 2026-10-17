"""add slots to daily_conditions

Revision ID: a1c3e5f7b9d2
Revises: 97df58913f05
Create Date: 2026-10-17 12:00:00.000000+08:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c3e5f7b9d2'
down_revision: Union[str, None] = '97df58913f05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 白天 4 個時段的逐時彙整 + 各自燈號（JSON 陣列）。
    # 舊資料列留 NULL，下一次 refresh 會補上。
    with op.batch_alter_table('daily_conditions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('slots', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('daily_conditions', schema=None) as batch_op:
        batch_op.drop_column('slots')
