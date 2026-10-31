"""取代舊 ci.yml 的 import + seed 冒煙測試：建表、寫入示範資料，API 能回應。"""

from fastapi.testclient import TestClient


def test_seed_and_api():
    from app import seed
    from app.main import app
    from app.seed_data import LOCATIONS

    seed.run()
    seed.run()  # 重複執行要安全（upsert）

    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert "commit" in health.json()
        res = client.get("/api/locations")
        assert res.status_code == 200
        body = res.json()
        assert len(body) == len(LOCATIONS)
        slug = body[0]["slug"]
        detail = client.get(f"/api/locations/{slug}")
        assert detail.status_code == 200
        assert detail.json()["slug"] == slug


def test_refresh_result_fits_api_schema():
    """/api/refresh 用 RefreshResult 驗證 run() 的回傳，欄位型別不能悄悄改掉。"""
    from app.schemas import RefreshResult

    sample = {
        "updated_locations": 12,
        "days": 4,
        "source": "openmeteo",
        "fetch_mode": "batch",
        "total_locations": 13,
        "failed": [{"location": "蘭嶼", "error": "timeout"}],
        "tide_failed": 2,
        "tide_failed_locations": ["基隆市", "高雄市"],
        "llm": False,
    }
    assert RefreshResult(**sample).tide_failed == 2
