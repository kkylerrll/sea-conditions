from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import settings

_connect_args: dict = {}
_engine_kwargs: dict = {"pool_pre_ping": True}

if settings.database_url.startswith("sqlite"):
    # SQLite + FastAPI 需要這個才能跨執行緒共用連線
    _connect_args = {"check_same_thread": False}
else:
    # 雲端 Postgres（Supabase 等）連線可能被中途切斷，設回收秒數比較穩
    _engine_kwargs["pool_recycle"] = 300
    _engine_kwargs["pool_size"] = 5
    _engine_kwargs["max_overflow"] = 5

engine = create_engine(settings.database_url, connect_args=_connect_args, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
