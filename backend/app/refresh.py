"""抓真實海況（Open-Meteo，免金鑰）→ 重算燈號 → 產生 AI 建議 → 寫入 DB。

用法：
  python -m app.refresh                 # 只更新海況與燈號（模板建議）
  USE_LLM=true python -m app.refresh    # 額外呼叫 LLM 產生白話建議（需金鑰或 ant profile）

也可打 POST /api/refresh 觸發同一段邏輯。
"""

from __future__ import annotations

import logging

from .db import SessionLocal
from .migrate import run_migrations
from .models import Location
from .services.build import upsert_conditions
from .services.cwa import fetch_tide_schedule
from .services.marine import fetch_daily

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("refresh")


def run(days: int = 4) -> dict:
    run_migrations()
    db = SessionLocal()
    updated = 0
    try:
        locations = db.query(Location).order_by(Location.id).all()
        for loc in locations:
            try:
                rows = fetch_daily(loc.lat, loc.lon, days=days)
            except Exception as exc:  # noqa: BLE001
                log.warning("%s：Open-Meteo 抓取失敗，略過 — %s", loc.name, exc)
                continue

            tide_schedule = fetch_tide_schedule(loc.cwa_tide_station)
            for row in rows:
                tides = tide_schedule.get(row["date"].isoformat())
                if tides:
                    row.update(tides)

            n = upsert_conditions(db, loc, rows)
            updated += 1
            log.info("%s：更新 %d 天海況", loc.name, n)
        return {"updated_locations": updated, "days": days, "source": "openmeteo"}
    finally:
        db.close()


if __name__ == "__main__":
    run()
