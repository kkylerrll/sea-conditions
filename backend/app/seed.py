"""建表 + 寫入 6 個潛點 + 產生今天起 4 天的示範海況（source="mock"）。

用法：  python -m app.seed
重複執行安全：地點以 slug upsert，海況以 (地點,日期,來源) upsert。
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from .db import SessionLocal, engine
from .models import Base, Location
from .seed_data import LOCATIONS
from .services.build import mock_conditions, upsert_conditions

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("seed")


def run() -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        for spec in LOCATIONS:
            loc = db.scalar(select(Location).where(Location.slug == spec["slug"]))
            if loc is None:
                loc = Location(slug=spec["slug"])
                db.add(loc)
            for field, value in spec.items():
                setattr(loc, field, value)
            db.flush()
            n = upsert_conditions(db, loc, mock_conditions(loc, days=4))
            log.info("%s：寫入 %d 筆示範海況", loc.name, n)
        db.commit()
        log.info("完成，共 %d 個潛點", len(LOCATIONS))
    finally:
        db.close()


if __name__ == "__main__":
    run()
