"""綠 / 黃 / 紅 燈號規則。

刻意做得簡單、好調整：從 100 分往下扣，扣完看落在哪個區間。
潛水（rate_dive）與衝浪（rate_surf）邏輯相反 —— 潛水浪越大越扣分，
衝浪要有浪、且吃離岸風。之後可用使用者實測回報校正。
"""

from __future__ import annotations

# 蒲福風級對照（風速 m/s 上界）
_BEAUFORT_UPPER_MS = [0.5, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6]

# 16 方位羅盤字串 -> 度
_DIR_DEG = {
    "N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5, "E": 90, "ESE": 112.5,
    "SE": 135, "SSE": 157.5, "S": 180, "SSW": 202.5, "SW": 225, "WSW": 247.5,
    "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5,
}


def compass_to_deg(d: str | None) -> float | None:
    if not d:
        return None
    return _DIR_DEG.get(d.strip().upper())


def _ang_diff(a: float, b: float) -> float:
    """兩個方位角的最小夾角，0–180。"""
    return abs((a - b + 180) % 360 - 180)


def beaufort(wind_speed_ms: float | None) -> int | None:
    if wind_speed_ms is None:
        return None
    for scale, upper in enumerate(_BEAUFORT_UPPER_MS):
        if wind_speed_ms <= upper:
            return scale
    return 12


def _bucket(score: float) -> str:
    if score >= 70:
        return "green"
    if score >= 45:
        return "yellow"
    return "red"


def rate_dive(
    *,
    wave_height_m: float | None,
    wind_scale: int | None,
    wind_speed_ms: float | None = None,
    gust_ms: float | None = None,
) -> tuple[str, float | None, list[str]]:
    """潛水 / 自潛 / 浮潛燈號。浪與風越大越扣分。"""

    if wind_scale is None and wind_speed_ms is not None:
        wind_scale = beaufort(wind_speed_ms)

    if wave_height_m is None and wind_scale is None:
        return "unknown", None, ["缺少浪高與風力資料，無法判斷"]

    wh = wave_height_m if wave_height_m is not None else 0.0
    ws = wind_scale if wind_scale is not None else 0

    score = 100.0
    reasons: list[str] = []

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
    if not reasons:
        reasons.append("風浪平穩，適合下水")
    return _bucket_dive(score), round(score, 1), reasons


def _bucket_dive(score: float) -> str:
    if score >= 75:
        return "green"
    if score >= 45:
        return "yellow"
    return "red"


# 向後相容：舊 code 仍 import `rate`
rate = rate_dive


def rate_surf(
    *,
    wave_height_m: float | None,
    wave_period_s: float | None = None,
    wind_scale: int | None = None,
    wind_speed_ms: float | None = None,
    wind_dir: str | None = None,
    facing_deg: float | None = None,
    gust_ms: float | None = None,
) -> tuple[str, float | None, list[str]]:
    """衝浪燈號。要有浪、週期夠長、最好是離岸風。

    facing_deg = 該段海岸開口朝向（也就是湧浪來向 / 朝海方向）。
    給了才能判斷離岸 / 向岸風；沒給就只看風級。
    """

    if wind_scale is None and wind_speed_ms is not None:
        wind_scale = beaufort(wind_speed_ms)
    if wave_height_m is None:
        return "unknown", None, ["缺少浪高資料，無法判斷"]

    wh = wave_height_m
    ws = wind_scale if wind_scale is not None else 0
    score = 100.0
    reasons: list[str] = []

    # 浪高：衝浪要有浪，但太大危險（甜蜜點 ~0.7–2.0 m）
    if wh < 0.4:
        score -= 80
        reasons.append(f"浪高僅約 {wh:.1f} 公尺，幾乎沒浪")
    elif wh < 0.7:
        score -= 22
        reasons.append(f"浪高約 {wh:.1f} 公尺，偏小、適合初學或長板")
    elif wh <= 2.0:
        reasons.append(f"浪高約 {wh:.1f} 公尺，大小適中")
    elif wh <= 3.0:
        score -= 28
        reasons.append(f"浪高約 {wh:.1f} 公尺，偏大，進階者為主")
    else:
        score -= 68
        reasons.append(f"浪高約 {wh:.1f} 公尺過大，危險")

    # 週期：長週期 = 乾淨的地湧浪；短週期 = 風浪、浪面亂
    if wave_period_s is not None:
        if wave_period_s >= 10:
            score += 8
            reasons.append(f"週期約 {wave_period_s:.0f} 秒，乾淨的長浪")
        elif wave_period_s < 6:
            score -= 15
            reasons.append(f"週期僅約 {wave_period_s:.0f} 秒，浪面偏亂")

    # 風向 vs 海岸朝向
    wfrom = compass_to_deg(wind_dir)
    if facing_deg is not None and wfrom is not None and ws >= 2:
        onshore = _ang_diff(wfrom, facing_deg)          # 風從海面吹向岸
        offshore = _ang_diff(wfrom, (facing_deg + 180) % 360)  # 風從陸地吹向海
        if offshore <= 55:
            score += 12
            reasons.append("離岸風，浪面乾淨")
        elif onshore <= 55:
            score -= 22
            reasons.append("向岸風，浪面糊、亂")
        else:
            score -= 6
            reasons.append("側風")
    else:
        if ws >= 5:
            score -= 26
            reasons.append(f"風力 {ws} 級，浪面差")
        elif ws == 4:
            score -= 10
            reasons.append("風力 4 級，海面有白浪")

    if gust_ms is not None and gust_ms >= 20:
        score -= 10
        reasons.append("陣風強")

    score = max(0.0, min(100.0, score))
    if not reasons:
        reasons.append("條件普通")
    return _bucket(score), round(score, 1), reasons
