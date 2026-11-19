from app.services.advice import best_slot_sentence, generate_advice


def _slot(key, label, start, end, rating, score):
    return {
        "key": key,
        "label": label,
        "start": start,
        "end": end,
        "ratings": {"dive": {"rating": rating, "score": score}},
    }


def test_best_slot_picks_highest_score():
    c = {
        "slots": [
            _slot("early", "早上", "06:00", "09:00", "yellow", 60),
            _slot("morning", "上午", "09:00", "12:00", "green", 85),
            _slot("afternoon", "下午", "12:00", "15:00", "green", 80),
        ]
    }
    assert best_slot_sentence(c, "dive") == "最適合的時段：上午（09–12）。"


def test_best_slot_tie_keeps_earlier():
    c = {
        "slots": [
            _slot("early", "早上", "06:00", "09:00", "green", 80),
            _slot("morning", "上午", "09:00", "12:00", "green", 80),
        ]
    }
    assert best_slot_sentence(c, "dive").startswith("最適合的時段：早上")


def test_best_slot_skips_red_and_missing():
    c = {
        "slots": [
            _slot("early", "早上", "06:00", "09:00", "red", 30),
            {"key": "x", "label": "上午", "start": "09:00", "end": "12:00", "ratings": {}},
        ]
    }
    assert best_slot_sentence(c, "dive") == ""
    assert best_slot_sentence({}, "dive") == ""
    assert best_slot_sentence({"slots": None}, "dive") == ""


def test_template_without_llm():
    c = {"rating": "green", "wave_height_m": 0.5, "wind_scale": 2}
    text, model = generate_advice("綠島", c)
    assert model is None
    assert text.startswith("綠島這天條件不錯（浪高約 0.5 公尺、風力 2 級）")


def test_template_red_and_unknown():
    red, _ = generate_advice("墾丁", {"rating": "red", "wave_height_m": 2.4})
    assert "不建議下水" in red
    unknown, _ = generate_advice("墾丁", {})
    assert "資料還不齊" in unknown


def test_surf_template_appends_best_slot():
    c = {
        "rating": "yellow",
        "slots": [_slot("evening", "傍晚", "15:00", "18:00", "yellow", 55)],
    }
    # 衝浪時段要看 surf 的燈號；只有 dive 燈號時不該點名時段
    text, _ = generate_advice("金樽", c, activity="surf")
    assert "勉強能衝" in text
    assert "最適合的時段" not in text
