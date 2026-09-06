"""add ratings to daily_conditions

Revision ID: 97df58913f05
Revises: 474f847fb5b2
Create Date: 2026-09-06 22:30:00.000000+08:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '97df58913f05'
down_revision: Union[str, None] = '474f847fb5b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 依活動別的完整燈號：{"dive": {...}, "surf": {...}}。
    # 舊資料列留 NULL，下一次 refresh 會補上。
    with op.batch_alter_table('daily_conditions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('ratings', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('daily_conditions', schema=None) as batch_op:
        batch_op.drop_column('ratings')
