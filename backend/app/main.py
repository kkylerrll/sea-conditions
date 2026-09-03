from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .config import settings
from .db import SessionLocal, engine
from .models import Base, Location
from .routers import conditions, locations

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("app")

app = FastAPI(title="海況去不去 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(locations.router)
app.include_router(conditions.router)


@app.on_event("startup")
def _startup() -> None:
    # 建表；若完全沒有地點資料，自動 seed 一次，避免第一次打開是空的
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        count = db.scalar(select(func.count()).select_from(Location)) or 0
        if count == 0:
            log.info("資料庫沒有潛點，執行首次 seed…")
            from .seed import run as seed_run

            seed_run()
    finally:
        db.close()


@app.get("/")
def root() -> dict:
    return {"name": "海況去不去 API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llm": settings.use_llm, "db": settings.database_url.split("://", 1)[0]}
