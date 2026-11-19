"""fix cwa_tide_station for 基隆 / 高雄

CWA F-A0021-001 沒有「基隆市」「高雄市」這種城市層級的站名（回 TideForecasts: []），
改成實際存在的「基隆市中正區」「高雄市旗津區」。正式 DB 不會重跑 seed，所以用遷移更新。

Revision ID: c3e5a7b9d1f2
Revises: b2d4f6a8c0e1
Create Date: 2026-11-19 13:00:00.000000+08:00
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = 'c3e5a7b9d1f2'
down_revision: Union[str, None] = 'b2d4f6a8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE locations SET cwa_tide_station = '基隆市中正區' WHERE cwa_tide_station = '基隆市'")
    op.execute("UPDATE locations SET cwa_tide_station = '高雄市旗津區' WHERE cwa_tide_station = '高雄市'")


def downgrade() -> None:
    op.execute("UPDATE locations SET cwa_tide_station = '基隆市' WHERE cwa_tide_station = '基隆市中正區'")
    op.execute("UPDATE locations SET cwa_tide_station = '高雄市' WHERE cwa_tide_station = '高雄市旗津區'")
