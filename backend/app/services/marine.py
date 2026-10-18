"""用 Open-Meteo 抓浪高、湧浪週期、風力、水溫（第二步的主資料源）。

為什麼用 Open-Meteo 當預設：
  - 免金鑰、免註冊，`python -m app.refresh` 開箱即用；
  - 提供逐點的 daily 浪高/週期/風速，涵蓋台灣周邊海域；
  - CWA 的「沿岸海域預報」是分區文字（例：巴士海峽 浪高 1 到 2 公尺），
    要對應到單一潛點得再解析，之後在 cwa.py 疊上去當「官方參考」。
水下能見度：CWA 與 Open-Meteo 都沒有，先用「浪高越大能見度越差」的粗估，欄位標記為估計值。
潮汐：兩邊都沒有，留給 cwa.py（需金鑰）。
"""

from __future__ import annotations

import datetime as dt
import logging
import math

import httpx

log = logging.getLogger("marine")

_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

_DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def _deg_to_compass(deg: float | None) -> str | None:
    if deg is None:
        return None
    return _DIRS[round(deg / 22.5) % 16]


# 白天固定時段（start 含、end 不含，台北時間）。key 供前端對應，label 為顯示名稱。
SLOTS = [
    {"key": "early", "label": "早上", "start": 6, "end": 9},
    {"key": "morning", "label": "上午", "start": 9, "end": 12},
    {"key": "afternoon", "label": "下午", "start": 12, "end": 15},
    {"key": "evening", "label": "傍晚", "start": 15, "end": 18},
]


def _vector_mean_deg(degs: list[float]) -> float | None:
    """方位角的向量平均（避免 350° 與 10° 平均成 180°）。"""
    if not degs:
        return None
    x = sum(math.sin(math.radians(d)) for d in degs)
    y = sum(math.cos(math.radians(d)) for d in degs)
    if abs(x) < 1e-9 and abs(y) < 1e-9:
        return None
    return math.degrees(math.atan2(x, y)) % 360


def _hourly_by_date(hourly: dict, keys: list[str]) -> dict[str, dict[int, dict]]:
    """把 hourly 陣列整理成 {日期: {小時: {欄位: 值}}}。"""
    out: dict[str, dict[int, dict]] = {}
    times = hourly.get("time") or []
    for i, t in enumerate(times):
        try:
            date_str, hh = t[:10], int(t[11:13])
        except (ValueError, IndexError):
            continue
        rec = out.setdefault(date_str, {}).setdefault(hh, {})
        for k in keys:
            arr = hourly.get(k)
            if isinstance(arr, list) and i < len(arr) and arr[i] is not None:
                rec[k] = arr[i]
    return out


def aggregate_slots(hours: dict[int, dict]) -> list[dict] | None:
    """某一天的逐時資料 → 4 個白天時段的彙整（尚未含燈號，燈號在 build.enrich 補）。
    全部時段都缺資料就回傳 None。"""
    from .rating import beaufort  # 避免循環匯入

    slots: list[dict] = []
    any_data = False
    for sl in SLOTS:
        recs = [hours[h] for h in range(sl["start"], sl["end"]) if h in hours]

        def vals(k: str) -> list[float]:
            return [r[k] for r in recs if k in r]

        wh, wp, wsp, gu = vals("wave_height"), vals("wave_period"), vals("wind_speed_10m"), vals("wind_gusts_10m")
        wd = _vector_mean_deg(vals("wave_direction"))
        wnd = _vector_mean_deg(vals("wind_direction_10m"))
        wind_max = max(wsp) if wsp else None
        if wh or wsp:
            any_data = True
        slots.append(
            {
                "key": sl["key"],
                "label": sl["label"],
                "start": f"{sl['start']:02d}:00",
                "end": f"{sl['end']:02d}:00",
                "wave_height_m": round(max(wh), 2) if wh else None,
                "wave_period_s": round(sum(wp) / len(wp), 1) if wp else None,
                "wave_dir": _deg_to_compass(wd),
                "wind_speed_ms": round(wind_max, 1) if wind_max is not None else None,
                "wind_scale": beaufort(wind_max),
                "wind_dir": _deg_to_compass(wnd),
                "gust_ms": round(max(gu), 1) if gu else None,
            }
        )
    return slots if any_data else None


def _estimate_visibility_m(wave_height_m: float | None) -> float | None:
    if wave_height_m is None:
        return None
    # 很粗略：平靜 ~15m，浪高 2m 以上掉到 ~4m
    return round(max(3.0, 16.0 - wave_height_m * 6.0), 1)


def fetch_daily(lat: float, lon: float, days: int = 4, timeout: float = 15.0) -> list[dict]:
    """回傳從今天起 `days` 天、每天一筆的海況 dict（已含 source="openmeteo"）。"""

    marine_params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "wave_height_max,wave_period_max,wave_direction_dominant",
        # 逐時資料：算時段彙整；順便帶 SST，省掉第三次請求
        "hourly": "wave_height,wave_period,wave_direction,sea_surface_temperature",
        "timezone": "Asia/Taipei",
        "forecast_days": days,
    }
    forecast_params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
        "hourly": "wind_speed_10m,wind_gusts_10m,wind_direction_10m",
        "wind_speed_unit": "ms",
        "timezone": "Asia/Taipei",
        "forecast_days": days,
    }

    with httpx.Client(timeout=timeout) as client:
        marine = client.get(_MARINE_URL, params=marine_params)
        marine.raise_for_status()
        marine = marine.json()
        forecast = client.get(_FORECAST_URL, params=forecast_params)
        forecast.raise_for_status()
        forecast = forecast.json()

    md = marine.get("daily", {}) or {}
    fd = forecast.get("daily", {}) or {}
    dates = md.get("time") or fd.get("time") or []

    # 水溫（部分海域 Open-Meteo 沒有 SST，缺就 None）：取每天 12:00 那一筆
    sst_by_date: dict[str, float] = {}
    mh = marine.get("hourly", {}) or {}
    for t, v in zip(mh.get("time") or [], mh.get("sea_surface_temperature") or []):
        if t.endswith("12:00") and v is not None:
            sst_by_date[t[:10]] = float(v)

    # 逐時 → 每天 4 個時段；失敗或缺資料就是 None，不影響每日數值
    hourly_by_date: dict[str, dict[int, dict]] = {}
    try:
        for part in (
            _hourly_by_date(mh, ["wave_height", "wave_period", "wave_direction"]),
            _hourly_by_date(
                forecast.get("hourly", {}) or {}, ["wind_speed_10m", "wind_gusts_10m", "wind_direction_10m"]
            ),
        ):
            for d, hrs in part.items():
                for h, rec in hrs.items():
                    hourly_by_date.setdefault(d, {}).setdefault(h, {}).update(rec)
    except Exception as exc:  # noqa: BLE001
        log.info("逐時資料解析略過：%s", exc)
        hourly_by_date = {}

    def col(d: dict, key: str, i: int):
        arr = d.get(key)
        if isinstance(arr, list) and i < len(arr):
            return arr[i]
        return None

    rows: list[dict] = []
    for i, date_str in enumerate(dates):
        wave_h = col(md, "wave_height_max", i)
        wind_ms = col(fd, "wind_speed_10m_max", i)
        gust = col(fd, "wind_gusts_10m_max", i)
        rows.append(
            {
                "date": dt.date.fromisoformat(date_str),
                "source": "openmeteo",
                "wave_height_m": round(wave_h, 2) if wave_h is not None else None,
                "wave_period_s": round(col(md, "wave_period_max", i), 1)
                if col(md, "wave_period_max", i) is not None
                else None,
                "wave_dir": _deg_to_compass(col(md, "wave_direction_dominant", i)),
                "wind_speed_ms": round(wind_ms, 1) if wind_ms is not None else None,
                "gust_ms": round(gust, 1) if gust is not None else None,
                "wind_dir": _deg_to_compass(col(fd, "wind_direction_10m_dominant", i)),
                "water_temp_c": round(sst_by_date[date_str], 1) if date_str in sst_by_date else None,
                "visibility_m": _estimate_visibility_m(wave_h),
                "tide_high": None,
                "tide_low": None,
                "slots": aggregate_slots(hourly_by_date[date_str]) if date_str in hourly_by_date else None,
                "raw": {"marine_daily_index": i, "lat": lat, "lon": lon},
            }
        )
    return rows
