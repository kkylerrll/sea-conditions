"""台北時區小工具。

Render 容器跑在 UTC，但 Open-Meteo 的資料列是用 `timezone=Asia/Taipei` 抓的，
所以「今天是哪一天」必須用台北時區判斷，否則台北時間 00:00–08:00 之間
`date.today()` 會回傳前一天，API 就會把昨天的資料當今天丟出來。

Python 3.9 相容：`zoneinfo` 是標準庫；容器內少了系統 tzdata，靠 requirements 的
`tzdata` 套件補上。
"""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")


def now_taipei() -> dt.datetime:
    """現在時間（帶台北時區）。"""
    return dt.datetime.now(TAIPEI)


def today_taipei() -> dt.date:
    """台北當下的日期。"""
    return now_taipei().date()
