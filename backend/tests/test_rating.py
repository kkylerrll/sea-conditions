import pytest

from app.services.rating import beaufort, compass_to_deg, rate_dive, rate_surf


@pytest.mark.parametrize(
    ("ms", "scale"),
    [(None, None), (0.0, 0), (0.5, 0), (0.6, 1), (3.3, 2), (5.5, 3), (5.6, 4), (8.0, 5), (32.6, 11), (40.0, 12)],
)
def test_beaufort_boundaries(ms, scale):
    assert beaufort(ms) == scale


def test_compass_to_deg():
    assert compass_to_deg("N") == 0
    assert compass_to_deg(" sw ") == 225
    assert compass_to_deg("") is None
    assert compass_to_deg(None) is None
    assert compass_to_deg("XYZ") is None


class TestRateDive:
    def test_calm_is_green(self):
        rating, score, reasons = rate_dive(wave_height_m=0.4, wind_scale=2)
        assert rating == "green"
        assert score == 100
        assert reasons == ["風浪平穩，適合下水"]

    def test_no_data_is_unknown(self):
        assert rate_dive(wave_height_m=None, wind_scale=None) == (
            "unknown",
            None,
            ["缺少浪高與風力資料，無法判斷"],
        )

    def test_wind_speed_fills_missing_scale(self):
        # 只有風速 9 m/s（5 級），浪很小 → 扣 35 分 = 65，黃燈
        rating, score, _ = rate_dive(wave_height_m=0.3, wind_scale=None, wind_speed_ms=9.0)
        assert (rating, score) == ("yellow", 65)

    def test_moderate_swell_is_yellow(self):
        rating, score, reasons = rate_dive(wave_height_m=1.2, wind_scale=3)
        assert (rating, score) == ("yellow", 65)
        assert "湧浪偏大" in reasons[0]

    def test_big_waves_are_red(self):
        rating, score, _ = rate_dive(wave_height_m=2.5, wind_scale=6)
        assert rating == "red"
        assert score == 0  # 扣到負數會夾在 0

    def test_strong_gust_penalised(self):
        _, calm, _ = rate_dive(wave_height_m=0.5, wind_scale=3)
        _, gusty, reasons = rate_dive(wave_height_m=0.5, wind_scale=3, gust_ms=18)
        assert calm - gusty == 12
        assert any("陣風" in r for r in reasons)

    def test_green_threshold_is_75(self):
        # 浪 0.8 m（-15）+ 風 4 級（-15）= 70：一般 bucket 是綠，但潛水門檻 75 → 黃
        rating, score, _ = rate_dive(wave_height_m=0.8, wind_scale=4)
        assert (rating, score) == ("yellow", 70)


class TestRateSurf:
    def test_flat_is_red(self):
        rating, _, reasons = rate_surf(wave_height_m=0.2)
        assert rating == "red"
        assert "幾乎沒浪" in reasons[0]

    def test_missing_wave_is_unknown(self):
        assert rate_surf(wave_height_m=None)[0] == "unknown"

    def test_offshore_beats_onshore(self):
        # 海岸朝東（90°）：西風（W，從陸地吹向海）= 離岸；東風 = 向岸
        common = {"wave_height_m": 1.2, "wave_period_s": 9, "wind_scale": 3, "facing_deg": 90}
        off_rating, off_score, off_reasons = rate_surf(wind_dir="W", **common)
        _, on_score, on_reasons = rate_surf(wind_dir="E", **common)
        assert off_rating == "green"
        assert "離岸風，浪面乾淨" in off_reasons
        assert "向岸風，浪面糊、亂" in on_reasons
        assert (off_score, on_score) == (100, 78)

    def test_long_period_bonus_capped_at_100(self):
        _, score, reasons = rate_surf(wave_height_m=1.5, wave_period_s=12, wind_scale=1)
        assert score == 100
        assert any("長浪" in r for r in reasons)

    def test_short_period_penalised(self):
        _, score, _ = rate_surf(wave_height_m=1.5, wave_period_s=5, wind_scale=1)
        assert score == 85

    def test_without_facing_uses_wind_scale_only(self):
        rating, score, _ = rate_surf(wave_height_m=1.5, wind_scale=5, wind_dir="W")
        assert (rating, score) == ("green", 74)
