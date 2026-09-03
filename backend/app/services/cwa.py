"""中央氣象署開放資料（需 CWA_API_KEY）。

用途：補上 Open-Meteo 沒有的**潮汐**（滿潮／乾潮時間）。

資料集：
  - F-A0021-001  潮汐預報（未來 1 個月，鄉鎮／漁港／潛點／衝浪點 皆有站點，
                 內容含 乾潮／滿潮 的時間與潮高）
  - F-A0012-001  海面天氣預報（分區文字，之後可當官方參考）

各站的 LocationName 寫在 seed_data.py 的 cwa_tide_station。一次抓一個站的整月預報
（一個 API call），再依日期切出來。沒有金鑰或解析不到時回傳空 dict，不影響主流程。
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import re
from pathlib import Path
from typing import Any, Optional

import httpx

from ..config import settings

log = logging.getLogger("cwa")

_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore"
_TIDE_DATASET = "F-A0021-001"
_MARINE_DATASET = "F-A0012-001"

_TIDE_WORDS = {"乾潮": "low", "滿潮": "high", "低潮": "low", "高潮": "high"}
_SAMPLE_DUMP = Path(__file__).resolve().parents[2] / "cwa_sample_tide.json"


def _enabled() -> bool:
    if not settings.cwa_api_key:
        log.info("未設定 CWA_API_KEY，跳過中央氣象署潮汐")
        return False
    return True


def _iter_dicts(node: Any):
    """深度優先走訪任何 dict（不管巢狀結構長怎樣）。"""
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _iter_dicts(v)
    elif isinstance(node, list):
        for v in node:
            yield from _iter_dicts(v)


def _find_datetime(d: dict) -> Optional[str]:
    for k, v in d.items():
        if isinstance(v, str) and re.search(r"time|date", k, re.I):
            m = re.search(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})", v)
            if m:
                return f"{m.group(1)}T{m.group(2)}"
    return None


def _find_tide_kind(d: dict) -> Optional[str]:
    for v in d.values():
        if isinstance(v, str) and v.strip() in _TIDE_WORDS:
            return _TIDE_WORDS[v.strip()]
    return None


def fetch_tide_schedule(station_name: Optional[str], timeout: float = 20.0) -> dict[str, dict]:
    """回傳 {date_iso: {"tide_high": "05:12 / 17:40", "tide_low": "11:20 / 23:50"}}。

    抓不到就回傳空 dict。整月資料一次抓回，呼叫端自己挑日期。
    """

    if not _enabled() or not station_name:
        return {}

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                f"{_BASE}/{_TIDE_DATASET}",
                params={
                    "Authorization": settings.cwa_api_key,
                    "format": "JSON",
                    # 不同資料集參數大小寫不一致，兩個都帶
                    "LocationName": station_name,
                    "locationName": station_name,
                },
            )
            resp.raise_for_status()
            payload = resp.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("CWA 潮汐抓取失敗（%s）：%s", station_name, exc)
        return {}

    if not _SAMPLE_DUMP.exists():
        try:
            _SAMPLE_DUMP.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
            log.info("已存 CWA 潮汐原始樣本到 %s（供日後對照解析）", _SAMPLE_DUMP)
        except OSError:
            pass

    by_date: dict[str, dict] = {}
    for d in _iter_dicts(payload.get("records", payload)):
        kind = _find_tide_kind(d)
        if not kind:
            continue
        ts = _find_datetime(d)
        if not ts:
            continue
        day, hhmm = ts[:10], ts[11:16]
        slot = by_date.setdefault(day, {"high": [], "low": []})
        slot[kind].append(hhmm)

    result: dict[str, dict] = {}
    for day, slot in by_date.items():
        result[day] = {
            "tide_high": " / ".join(sorted(set(slot["high"]))) or None,
            "tide_low": " / ".join(sorted(set(slot["low"]))) or None,
        }

    if not result:
        log.info("CWA 潮汐：%s 沒有解析到任何資料（結構可能有變，見 %s）", station_name, _SAMPLE_DUMP.name)
    return result


def fetch_marine_forecast(timeout: float = 20.0) -> Optional[dict]:
    """海面天氣預報原始 dict（官方文字參考，暫不解析）。"""

    if not _enabled():
        return None
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                f"{_BASE}/{_MARINE_DATASET}",
                params={"Authorization": settings.cwa_api_key, "format": "JSON"},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("CWA 海面預報抓取失敗：%s", exc)
        return None
