"""建表 + 寫入地區 / 子潛點 + 產生今天起 4 天的示範海況（source="mock"）。

用法：  python -m app.seed
重複執行安全：地區 / 子潛點以 slug upsert，海況以 (地點,日期,來源) upsert。
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from .db import SessionLocal
from .migrate import run_migrations
from .models import Location, Spot
from .seed_data import LOCATIONS, SPOTS
from .services.build import mock_conditions, upsert_conditions

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("seed")


def run() -> None:
    run_migrations()
    db = SessionLocal()
    try:
        loc_by_slug: dict[str, Location] = {}
        for spec in LOCATIONS:
            loc = db.scalar(select(Location).where(Location.slug == spec["slug"]))
            if loc is None:
                loc = Location(slug=spec["slug"])
                db.add(loc)
            for field, value in spec.items():
                setattr(loc, field, value)
            db.flush()
            loc_by_slug[loc.slug] = loc
            n = upsert_conditions(db, loc, mock_conditions(loc, days=4))
            log.info("%s：寫入 %d 筆示範海況", loc.name, n)

        for i, spec in enumerate(SPOTS):
            parent = loc_by_slug.get(spec["location"])
            if parent is None:
                log.warning("子潛點 %s 找不到所屬地區 %s，略過", spec["slug"], spec["location"])
                continue
            spot = db.scalar(select(Spot).where(Spot.slug == spec["slug"]))
            if spot is None:
                spot = Spot(slug=spec["slug"])
                db.add(spot)
            for field, value in spec.items():
                if field == "location":
                    continue
                setattr(spot, field, value)
            spot.location_id = parent.id
            spot.sort = i

        db.commit()
        log.info("完成：%d 個地區、%d 個子潛點", len(LOCATIONS), len(SPOTS))
    finally:
        db.close()


if __name__ == "__main__":
    run()
