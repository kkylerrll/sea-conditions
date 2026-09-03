"""把當天海況數據轉成一段白話建議（第四步）。

有 ANTHROPIC_API_KEY（或本機 `ant auth login` 的 profile）且 USE_LLM=true 時呼叫 LLM，
否則退回本地模板句，讓畫面永遠有東西可顯示、也不會產生 API 費用。
"""

from __future__ import annotations

import logging

from ..config import settings

log = logging.getLogger("advice")

SYSTEM = (
    "你是台灣潛水與自由潛水的資深教練，也是海況播報員。"
    "根據當天數據，用口語、像朋友提醒的語氣寫 2 至 3 句繁體中文建議，"
    "直接講今天適不適合去這個點、建議幾點去、下水要注意什麼。"
    "不要條列、不要照抄數字、不要用「根據資料顯示」這種制式開頭。資料不足就直接說不確定。"
)

_RATING_LABEL = {"green": "適合", "yellow": "勉強", "red": "不建議", "unknown": "資料不足"}


def _fmt(v, unit: str = "") -> str:
    return f"{v}{unit}" if v is not None else "無資料"


def _template(location_name: str, c: dict) -> str:
    rating = c.get("rating", "unknown")
    wh = c.get("wave_height_m")
    ws = c.get("wind_scale")

    detail_bits = []
    if wh is not None:
        detail_bits.append(f"浪高約 {wh:.1f} 公尺")
    if ws is not None:
        detail_bits.append(f"風力 {ws} 級")
    detail = "、".join(detail_bits)
    detail_clause = f"（{detail}）" if detail else ""

    if rating == "green":
        return (
            f"{location_name}這天條件不錯{detail_clause}，"
            "建議把握上午風浪較小、能見度較好的時段下水。"
        )
    if rating == "yellow":
        return (
            f"{location_name}這天算勉強可下水{detail_clause}，"
            "找有經驗的夥伴同行，並在下水前再確認一次現場流況與能見度。"
        )
    if rating == "red":
        return (
            f"{location_name}這天不建議下水{detail_clause}，"
            "風浪偏大，改期、或改去背風的灣內點會安全得多。"
        )
    return (
        f"{location_name}這天的海況資料還不齊，"
        "出發前請再查一次中央氣象署沿岸海域預報與現場狀況。"
    )


def generate_advice(location_name: str, c: dict) -> tuple[str, str | None]:
    """回傳 (advice_text, model_id or None)。"""

    template = _template(location_name, c)
    if not settings.use_llm:
        return template, None

    try:
        import anthropic
    except ImportError:
        log.warning("anthropic 套件未安裝，改用模板建議")
        return template, None

    try:
        # 不帶 api_key 也可：SDK 會依序找 ANTHROPIC_API_KEY / ant auth login profile
        client = (
            anthropic.Anthropic(api_key=settings.anthropic_api_key)
            if settings.anthropic_api_key
            else anthropic.Anthropic()
        )
        user = (
            f"地點：{location_name}\n"
            f"日期：{c.get('date')}\n"
            f"系統燈號：{_RATING_LABEL.get(c.get('rating'), c.get('rating'))}"
            f"（分數 {_fmt(c.get('rating_score'))}/100）\n"
            f"浪高：{_fmt(c.get('wave_height_m'), ' m')}\n"
            f"湧浪週期：{_fmt(c.get('wave_period_s'), ' s')}\n"
            f"風力：{_fmt(c.get('wind_scale'), ' 級')}（{_fmt(c.get('wind_speed_ms'), ' m/s')}）"
            f" 風向 {_fmt(c.get('wind_dir'))}\n"
            f"陣風：{_fmt(c.get('gust_ms'), ' m/s')}\n"
            f"水溫：{_fmt(c.get('water_temp_c'), ' °C')}\n"
            f"滿潮：{_fmt(c.get('tide_high'))}／乾潮：{_fmt(c.get('tide_low'))}\n"
            f"系統判讀：{'；'.join(c.get('rating_reasons') or []) or '無'}"
        )
        resp = client.messages.create(
            model=settings.llm_model,
            max_tokens=400,
            system=SYSTEM,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        if text:
            return text, settings.llm_model
        return template, None
    except Exception as exc:  # noqa: BLE001 — 任何失敗都不該讓 refresh 掛掉
        log.warning("LLM 產生建議失敗，改用模板：%s", exc)
        return template, None
