"""CWA 潮汐解析：用真實回應樣本（基隆市中正區）驗證，並鎖住「測站名稱必須是 CWA 認得的」。"""

import json
from pathlib import Path

import pytest

from app.seed_data import LOCATIONS
from app.services import cwa

FIXTURE = Path(__file__).parent / "fixtures" / "cwa_tide_keelung.json"

# 城市層級名稱 CWA 的 F-A0021-001 沒有資料（TideForecasts 為空陣列），必須用鄉鎮區
BAD_STATIONS = {"基隆市", "高雄市"}


class _Resp:
    def __init__(self, payload):
        self._p = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._p


class _Client:
    def __init__(self, payload):
        self._p = payload

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get(self, *a, **k):
        return _Resp(self._p)


def _patch(monkeypatch, payload):
    monkeypatch.setattr(cwa.settings, "cwa_api_key", "dummy")
    monkeypatch.setattr(cwa, "_SAMPLE_DUMP", Path("/nonexistent-dir/sample.json"))
    monkeypatch.setattr(cwa.httpx, "Client", lambda **kw: _Client(payload))


def test_parse_real_sample(monkeypatch):
    payload = json.loads(FIXTURE.read_text())
    _patch(monkeypatch, payload)
    result = cwa.fetch_tide_schedule("基隆市中正區", strict=True)
    assert len(result) == 2
    for tides in result.values():
        assert tides["tide_high"] and tides["tide_low"]
        assert ":" in tides["tide_high"].split(" / ")[0]


def test_empty_station_result_is_failure_in_strict_mode(monkeypatch):
    """CWA 對不認得的名稱回 TideForecasts: []——strict 要拋錯，refresh 才會記為 tide_failed。"""
    payload = {"success": "true", "records": {"dataid": "F-A0021-001", "TideForecasts": []}}
    _patch(monkeypatch, payload)
    with pytest.raises(ValueError):
        cwa.fetch_tide_schedule("基隆市", strict=True)
    assert cwa.fetch_tide_schedule("基隆市") == {}


def test_seed_stations_not_city_level():
    for loc in LOCATIONS:
        assert loc["cwa_tide_station"] not in BAD_STATIONS, loc["slug"]
