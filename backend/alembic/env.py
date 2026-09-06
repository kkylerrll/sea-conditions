"""Alembic 執行環境。

連線字串一律從 app.config.settings.database_url 取得，因此本機 SQLite 與
Supabase Postgres 共用同一套遷移。SQLite 需要 batch 模式才能 ALTER TABLE。
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.models import Base

config = context.config

# 從設定注入連線字串（不放在 alembic.ini，避免把密碼寫進 git）
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    # disable_existing_loggers=False：從 app 內部以程式呼叫 upgrade 時，不要把 app 的 logger 關掉
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

_IS_SQLITE = settings.database_url.startswith("sqlite")


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=_IS_SQLITE,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=_IS_SQLITE,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
