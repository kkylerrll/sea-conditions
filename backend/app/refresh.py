"""抓真實海況（Open-Meteo，免金鑰）→ 重算燈號 → 產生 AI 建議 → 寫入 DB。

用法：
  python -m app.refresh                 # 只更新海況與燈號（模板建議）
  USE_LLM=true python -m app.refresh    # 額外呼叫 LLM 產生白話建議（需金鑰或 ant profile）

也可打 POST /api/refresh 觸發同一段邏輯。

Open-Meteo 先用一次批次請求抓全部地點（海況、風各 1 個請求）；批次失敗才退回逐地點抓。

排程（GitHub Actions）直接跑 `python -m app.refresh` 寫正式 DB，並設 SKIP_MIGRATIONS=1
（正式 DB 的遷移只由 Render 部署時的 alembic 負責）。結束碼：
  - 有任何地點的海況沒更新到（updated < total）→ 1，讓 Actions 變紅。
    成功的地點照樣寫入；變紅是為了讓人看見，不要再出現「綠勾但蘭嶼從來沒更新」。
  - 潮汐失敗（含請求成功但解析不到資料）→ 0，但印出 ::warning:: 列出地點（潮汐是附加資訊）
"""

from __future__ import annotations

import json
import logging
import os
import sys

import httpx

from .db import SessionLocal
from .migrate import run_migrations
from .models import Location
from .services.build import upsert_conditions
from .services.cwa import fetch_tide_schedule
from .services.marine import fetch_daily, fetch_daily_many

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("refresh")


def _describe_error(exc: Exception) -> str:
    """例外類別 + 簡短訊息；HTTP 錯誤附狀態碼與回應內容前 200 字。"""
    if isinstance(exc, httpx.HTTPStatusError):
        body = (exc.response.text or "")[:200]
        return f"{type(exc).__name__}: HTTP {exc.response.status_code} {body}"
    return f"{type(exc).__name__}: {str(exc)[:200]}"


def run(days: int = 4) -> dict:
    # Actions 直接連正式 DB 時不可跑遷移（由 Render 部署負責）
    if os.environ.get("SKIP_MIGRATIONS", "").lower() not in ("1", "true", "yes"):
        run_migrations()
    db = SessionLocal()
    updated = 0
    tide_failed: list[str] = []  # 地點名稱；回傳時 tide_failed 仍是數量（API 結構不變）
    failed: list = []
    try:
        locations = db.query(Location).order_by(Location.id).all()
        # 先批次抓全部地點；批次失敗就退回逐地點抓（不會比批次前更糟）
        batch: list | None = None
        fetch_mode = "batch"
        try:
            batch = fetch_daily_many([(loc.lat, loc.lon) for loc in locations], days=days)
        except Exception as exc:  # noqa: BLE001
            log.warning("Open-Meteo 批次抓取失敗，改為逐地點抓 — %s", _describe_error(exc))
            fetch_mode = "per-location"

        for i, loc in enumerate(locations):
            if batch is not None:
                rows = batch[i]
            else:
                try:
                    rows = fetch_daily(loc.lat, loc.lon, days=days)
                except Exception as exc:  # noqa: BLE001
                    log.warning("%s：Open-Meteo 抓取失敗，略過 — %s", loc.name, exc)
                    failed.append({"location": loc.name, "error": _describe_error(exc)})
                    continue

            try:
                tide_schedule = fetch_tide_schedule(loc.cwa_tide_station, strict=True)
            except Exception:  # noqa: BLE001 — cwa 已記 log；潮汐失敗不影響海況
                tide_failed.append(loc.name)
                tide_schedule = {}
            for row in rows:
                tides = tide_schedule.get(row["date"].isoformat())
                if tides:
                    row.update(tides)

            n = upsert_conditions(db, loc, rows)
            updated += 1
            log.info("%s：更新 %d 天海況", loc.name, n)
        return {
            "updated_locations": updated,
            "days": days,
            "source": "openmeteo",
            "fetch_mode": fetch_mode,
            "total_locations": len(locations),
            "failed": failed,
            "tide_failed": len(tide_failed),
            "tide_failed_locations": tide_failed,
        }
    finally:
        db.close()


def main() -> int:
    result = run()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    updated, total = result["updated_locations"], result["total_locations"]
    if result["tide_failed"]:
        names = "、".join(result.get("tide_failed_locations", []))
        print(f"::warning::{result['tide_failed']} 個地點的潮汐抓取失敗：{names}")
    if updated == 0:
        print(f"::error::海況更新全數失敗（0/{total}），請看上方 failed 錯誤訊息")
        return 1
    if updated < total:
        names = "、".join(f["location"] for f in result["failed"])
        print(f"::error::部分地點海況沒更新到（{updated}/{total}）：{names}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
