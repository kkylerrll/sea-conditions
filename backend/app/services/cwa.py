"""中央氣象署開放資料（需 CWA_API_KEY）。

目前用途：補上 Open-Meteo 沒有的**潮汐**（滿潮/乾潮時間），並保留抓「沿岸海域天氣預報」
當官方參考的位置。沒有金鑰時所有函式回傳 None，不影響主流程。

資料集：
  - F-A0021-001  沿岸海域天氣預報（分區：浪高、風力、風向）
  - F-A0021-001 的潮汐 / 潮位預報：CWA 潮汐預報資料集代碼請到
    https://opendata.cwa.gov.tw/dataset 搜「潮汐」確認後填入 _TIDE_DATASET。
    （各站代碼不同，先以站名字串比對）
"""

from __future__ import annotations

import datetime as dt
import logging

import httpx

from ..config import settings

log = logging.getLogger("cwa")

_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore"
_COASTAL_DATASET = "F-A0021-001"          # 沿岸海域天氣預報
_TIDE_DATASET = "F-A0021-001"             # TODO: 換成正確的潮汐預報資料集代碼


def _enabled() -> bool:
    if not settings.cwa_api_key:
        log.info("未設定 CWA_API_KEY，跳過中央氣象署資料")
        return False
    return True


def fetch_tides(station_name: str | None, target_date: dt.date, timeout: float = 15.0) -> dict | None:
    """回傳 {"tide_high": "05:12 / 17:40", "tide_low": "11:20 / 23:50"} 或 None。"""

    if not _enabled() or not station_name:
        return None
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                f"{_BASE}/{_TIDE_DATASET}",
                params={"Authorization": settings.cwa_api_key, "format": "JSON"},
            )
            resp.raise_for_status()
            _ = resp.json()
        # TODO: 依實際 payload 結構解析出該站、該日的滿潮/乾潮時間
        log.info("CWA 潮汐資料集已連線，尚未實作解析（station=%s date=%s）", station_name, target_date)
        return None
    except Exception as exc:  # noqa: BLE001
        log.warning("CWA 潮汐抓取失敗：%s", exc)
        return None


def fetch_coastal_forecast(zone_name: str | None, timeout: float = 15.0) -> dict | None:
    """沿岸海域預報（官方文字參考）。回傳原始 dict 或 None。"""

    if not _enabled() or not zone_name:
        return None
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                f"{_BASE}/{_COASTAL_DATASET}",
                params={"Authorization": settings.cwa_api_key, "format": "JSON", "locationName": zone_name},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("CWA 沿岸預報抓取失敗：%s", exc)
        return None
