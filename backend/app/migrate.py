"""以程式方式跑 Alembic 遷移。

正式環境是由 Dockerfile 的 CMD 先跑 `alembic upgrade head` 再起 uvicorn；
這裡讓本機開發（直接 `uvicorn app.main:app`、`python -m app.seed`、
`python -m app.refresh`）也能自動把 schema 帶到最新，取代舊的
`Base.metadata.create_all`。多跑幾次是安全的（Alembic 會看版本表）。
"""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

log = logging.getLogger("migrate")

_BACKEND_DIR = Path(__file__).resolve().parent.parent  # .../backend


def alembic_config() -> Config:
    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    # 從 app 內部呼叫時 cwd 不一定是 backend/，用絕對路徑指定
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    return cfg


def run_migrations() -> None:
    """把資料庫升級到 head。"""
    log.info("Alembic：upgrade head…")
    command.upgrade(alembic_config(), "head")
