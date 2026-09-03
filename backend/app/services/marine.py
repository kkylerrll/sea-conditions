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

import httpx

log = logging.getLogger("marine")

_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

_DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def _deg_to_compass(deg: float | None) -> str | None:
    if deg is None:
        return None
    return _DIRS[round(deg / 22.5) % 16]


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
        "timezone": "Asia/Taipei",
        "forecast_days": days,
    }
    forecast_params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
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

    # 嘗試抓水溫（部分海域 Open-Meteo 沒有 SST，缺就 None）
    sst_by_date: dict[str, float] = {}
    try:
        with httpx.Client(timeout=timeout) as client:
            sst = client.get(
                _MARINE_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": "sea_surface_temperature",
                    "timezone": "Asia/Taipei",
                    "forecast_days": days,
                },
            )
            sst.raise_for_status()
            sst = sst.json().get("hourly", {})
        times = sst.get("time", [])
        temps = sst.get("sea_surface_temperature", [])
        for t, v in zip(times, temps):
            if t.endswith("12:00") and v is not None:
                sst_by_date[t[:10]] = float(v)
    except Exception as exc:  # noqa: BLE001
        log.info("SST 抓取略過：%s", exc)

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
                "wind_speed_ms": round(wind_ms, 1) if wind_ms is not None else None,
                "gust_ms": round(gust, 1) if gust is not None else None,
                "wind_dir": _deg_to_compass(col(fd, "wind_direction_10m_dominant", i)),
                "water_temp_c": round(sst_by_date[date_str], 1) if date_str in sst_by_date else None,
                "visibility_m": _estimate_visibility_m(wave_h),
                "tide_high": None,
                "tide_low": None,
                "raw": {"marine_daily_index": i, "lat": lat, "lon": lon},
            }
        )
    return rows
