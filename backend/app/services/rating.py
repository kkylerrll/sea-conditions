"""綠 / 黃 / 紅 燈號規則（第三步）。

刻意做得簡單、好調整：從 100 分往下扣，扣完看落在哪個區間。
之後可以依活動別（scuba / freedive / surf）給不同門檻，或用使用者實測回報校正。
"""

from __future__ import annotations

# 蒲福風級對照（風速 m/s 上界）
_BEAUFORT_UPPER_MS = [0.5, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6]


def beaufort(wind_speed_ms: float | None) -> int | None:
    if wind_speed_ms is None:
        return None
    for scale, upper in enumerate(_BEAUFORT_UPPER_MS):
        if wind_speed_ms <= upper:
            return scale
    return 12


def rate(
    *,
    wave_height_m: float | None,
    wind_scale: int | None,
    wind_speed_ms: float | None = None,
    gust_ms: float | None = None,
) -> tuple[str, float | None, list[str]]:
    """回傳 (rating, score, reasons)。rating ∈ green|yellow|red|unknown。"""

    if wind_scale is None and wind_speed_ms is not None:
        wind_scale = beaufort(wind_speed_ms)

    if wave_height_m is None and wind_scale is None:
        return "unknown", None, ["缺少浪高與風力資料，無法判斷"]

    wh = wave_height_m if wave_height_m is not None else 0.0
    ws = wind_scale if wind_scale is not None else 0

    score = 100.0
    reasons: list[str] = []

    # 浪高扣分
    if wh <= 0.6:
        pass
    elif wh <= 1.0:
        score -= 15
        reasons.append(f"浪高約 {wh:.1f} 公尺，一般程度可下水")
    elif wh <= 1.5:
        score -= 35
        reasons.append(f"浪高約 {wh:.1f} 公尺，湧浪偏大、能見度會變差")
    elif wh <= 2.0:
        score -= 55
        reasons.append(f"浪高約 {wh:.1f} 公尺，只建議有經驗的人下水")
    else:
        score -= 82
        reasons.append(f"浪高約 {wh:.1f} 公尺過大，不建議下水")

    # 風力扣分
    if ws <= 3:
        pass
    elif ws == 4:
        score -= 15
        reasons.append("風力 4 級，海面開始有白浪")
    elif ws == 5:
        score -= 35
        reasons.append("風力 5 級，體感差、容易起流")
    else:
        score -= 62
        reasons.append(f"風力 {ws} 級，海況惡劣")

    if gust_ms is not None and gust_ms >= 17:
        score -= 12
        reasons.append("陣風偏強，岸邊進出要小心")

    score = max(0.0, min(100.0, score))

    if score >= 75:
        rating = "green"
    elif score >= 45:
        rating = "yellow"
    else:
        rating = "red"

    if not reasons:
        reasons.append("風浪平穩，適合下水")

    return rating, round(score, 1), reasons
