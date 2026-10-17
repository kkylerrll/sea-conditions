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
from .marine import SLOTS
from .rating import beaufort, rate_dive, rate_surf


def _mock_slots(seed: int, wave: float, wind_ms: float, gust: float, offset: int) -> list[dict]:
    """示範用時段：浪高大致不變、風隨時間增強（模擬午後海風）。"""
    slots = []
    for i, sl in enumerate(SLOTS):
        wind = round(max(0.5, wind_ms * (0.55 + 0.25 * i)), 1)
        w = round(max(0.1, wave * (0.9 + 0.07 * i)), 2)
        slots.append(
            {
                "key": sl["key"],
                "label": sl["label"],
                "start": f"{sl['start']:02d}:00",
                "end": f"{sl['end']:02d}:00",
                "wave_height_m": w,
                "wave_period_s": round(4 + ((seed // 7) % 60) / 10.0, 1),
                "wave_dir": ["NE", "ENE", "E", "ESE", "SE", "S"][seed % 6],
                "wind_speed_ms": wind,
                "wind_scale": beaufort(wind),
                "wind_dir": ["NE", "N", "ENE", "E", "SE", "S"][seed % 6],
                "gust_ms": round(max(gust * (0.6 + 0.2 * i), wind), 1),
            }
        )
    return slots


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
                "slots": _mock_slots(seed, wave, wind_ms, gust, offset),
                "raw": {"mock": True},
            }
        )
    return rows


def primary_activity(activities: list | None) -> str:
    """這個地區主要是潛水點還是浪點：只標了 surf → "surf"，其餘 → "dive"。
    決定「相容燈號 / 建議文」要以哪個活動為準。前端 lib/sea.ts 有相同規則。"""
    acts = activities or []
    dive_like = {"scuba", "freedive", "snorkel"}
    if "surf" in acts and not dive_like.intersection(acts):
        return "surf"
    return "dive"


def _rate_pair(r: dict) -> dict:
    """用一組浪／風數值算潛水與衝浪燈號（整天與各時段共用）。"""
    d_rating, d_score, d_reasons = rate_dive(
        wave_height_m=r.get("wave_height_m"),
        wind_scale=r.get("wind_scale"),
        wind_speed_ms=r.get("wind_speed_ms"),
        gust_ms=r.get("gust_ms"),
    )
    s_rating, s_score, s_reasons = rate_surf(
        wave_height_m=r.get("wave_height_m"),
        wave_period_s=r.get("wave_period_s"),
        wind_scale=r.get("wind_scale"),
        wind_speed_ms=r.get("wind_speed_ms"),
        wind_dir=r.get("wind_dir"),
        gust_ms=r.get("gust_ms"),
    )
    return {
        "dive": {"rating": d_rating, "score": d_score, "reasons": d_reasons},
        "surf": {"rating": s_rating, "score": s_score, "reasons": s_reasons},
    }


def enrich(location_name: str, row: dict, activities: list | None = None) -> dict:
    """就地補上 rating（相容欄位）+ ratings（依活動別）+ advice。

    activities = 該地區支援的活動；決定相容欄位 `rating` 與建議文以潛水還是
    衝浪為準（純浪點就用衝浪值，避免浪點顯示「浪大不建議下水」這種誤導）。
    """

    primary = primary_activity(activities)

    if row.get("wind_scale") is None:
        row["wind_scale"] = beaufort(row.get("wind_speed_ms"))

    row["ratings"] = _rate_pair(row)
    for sl in row.get("slots") or []:
        if sl.get("wind_scale") is None:
            sl["wind_scale"] = beaufort(sl.get("wind_speed_ms"))
        sl["ratings"] = _rate_pair(sl)
    # 相容欄位 = 主要活動的值（舊前端與 advice 只讀這組）
    compat = row["ratings"][primary]
    row["rating"] = compat["rating"]
    row["rating_score"] = compat["score"]
    row["rating_reasons"] = compat["reasons"]

    advice_text, advice_model = generate_advice(location_name, row, activity=primary)
    row["advice_text"] = advice_text
    row["advice_model"] = advice_model
    return row


def upsert_conditions(db: Session, location: Location, rows: list[dict]) -> int:
    """同 (location, date, source) 已存在就更新，否則新增。回傳寫入筆數。"""

    n = 0
    for row in rows:
        enrich(location.name, row, location.activities)
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
            "rating", "rating_score", "rating_reasons", "ratings", "slots", "advice_text", "advice_model", "raw",
        ):
            setattr(existing, field, row.get(field))
        existing.fetched_at = dt.datetime.now(dt.timezone.utc)
        n += 1
    db.commit()
    return n
