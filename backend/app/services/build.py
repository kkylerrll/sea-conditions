"""把「一筆海況數據 dict」補上燈號 + AI 建議，並寫進資料庫。

seed.py（示範資料）和 refresh.py（真實資料）共用這裡的邏輯。
"""

from __future__ import annotations

import datetime as dt
import hashlib
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DailyCondition, Location
from ..tz import today_taipei
from .advice import generate_advice
from .rating import beaufort, rate


def mock_conditions(location: Location, days: int = 4) -> list[dict]:
    """用 slug + 日期當種子產生穩定但有變化的示範海況，讓畫面一開始就有東西看。"""

    today = today_taipei()
    rows: list[dict] = []
    for offset in range(days):
        date = today + dt.timedelta(days=offset)
        seed = int(hashlib.sha256(f"{location.slug}-{date}".encode()).hexdigest(), 16)
        r1 = (seed % 1000) / 1000.0
        r2 = ((seed // 1000) % 1000) / 1000.0
        r3 = ((seed // 1_000_000) % 1000) / 1000.0

        wave = round(0.3 + r1 * 2.1, 2)                      # 0.3–2.4 m
        wind_ms = round(2.0 + r2 * 12.0, 1)                  # 2–14 m/s
        gust = round(wind_ms + 2 + r3 * 6, 1)
        water_temp = round(24.0 + 4.0 * math.sin(offset) + r3 * 2, 1)

        rows.append(
            {
                "date": date,
                "source": "mock",
                "wave_height_m": wave,
                "wave_period_s": round(4 + r2 * 6, 1),
                "wave_dir": ["NE", "ENE", "E", "ESE", "SE", "S"][seed % 6],
                "wind_speed_ms": wind_ms,
                "wind_scale": beaufort(wind_ms),
                "wind_dir": ["NE", "N", "ENE", "E", "SE", "S"][seed % 6],
                "gust_ms": gust,
                "water_temp_c": water_temp,
                "visibility_m": round(max(3.0, 16.0 - wave * 6.0), 1),
                "tide_high": None,
                "tide_low": None,
                "raw": {"mock": True},
            }
        )
    return rows


def enrich(location_name: str, row: dict) -> dict:
    """就地補上 rating / rating_score / rating_reasons / advice_text / advice_model。"""

    rating, score, reasons = rate(
        wave_height_m=row.get("wave_height_m"),
        wind_scale=row.get("wind_scale"),
        wind_speed_ms=row.get("wind_speed_ms"),
        gust_ms=row.get("gust_ms"),
    )
    row["rating"] = rating
    row["rating_score"] = score
    row["rating_reasons"] = reasons
    if row.get("wind_scale") is None:
        row["wind_scale"] = beaufort(row.get("wind_speed_ms"))

    advice_text, advice_model = generate_advice(location_name, row)
    row["advice_text"] = advice_text
    row["advice_model"] = advice_model
    return row


def upsert_conditions(db: Session, location: Location, rows: list[dict]) -> int:
    """同 (location, date, source) 已存在就更新，否則新增。回傳寫入筆數。"""

    n = 0
    for row in rows:
        enrich(location.name, row)
        existing = db.scalar(
            select(DailyCondition).where(
                DailyCondition.location_id == location.id,
                DailyCondition.date == row["date"],
                DailyCondition.source == row["source"],
            )
        )
        if existing is None:
            existing = DailyCondition(location_id=location.id, date=row["date"], source=row["source"])
            db.add(existing)
        for field in (
            "wave_height_m", "wave_period_s", "wave_dir", "wind_speed_ms", "wind_scale", "wind_dir",
            "gust_ms", "water_temp_c", "visibility_m", "tide_high", "tide_low",
            "rating", "rating_score", "rating_reasons", "advice_text", "advice_model", "raw",
        ):
            setattr(existing, field, row.get(field))
        existing.fetched_at = dt.datetime.now(dt.timezone.utc)
        n += 1
    db.commit()
    return n
