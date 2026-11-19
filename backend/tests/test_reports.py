"""使用者實測回報：POST / GET /api/locations/{slug}/reports。"""

import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app.tz import today_taipei


@pytest.fixture(scope="module")
def client():
    from app import seed
    from app.main import app

    seed.run()
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def slugs(client):
    return [loc["slug"] for loc in client.get("/api/locations").json()]


_ip_counter = {"n": 0}


def fresh_ip() -> dict:
    """每個測試用不同 IP，避免互相吃到重複／每日上限。"""
    _ip_counter["n"] += 1
    return {"X-Forwarded-For": f"203.0.113.{_ip_counter['n']}, 10.0.0.1"}


def body(**kw):
    base = {"date": today_taipei().isoformat(), "activity": "dive", "feeling": "good"}
    base.update(kw)
    return base


def test_create_success_hides_ip_hash(client, slugs):
    res = client.post(
        f"/api/locations/{slugs[0]}/reports",
        json=body(visibility_m=12, note="  水很清  "),
        headers=fresh_ip(),
    )
    assert res.status_code == 201
    data = res.json()
    assert data["note"] == "水很清"
    assert data["visibility_m"] == 12
    assert data["feeling"] == "good"
    assert "ip_hash" not in data
    assert set(data) == {"date", "activity", "feeling", "visibility_m", "note", "created_at"}


def test_empty_note_becomes_null(client, slugs):
    res = client.post(f"/api/locations/{slugs[0]}/reports", json=body(note="   "), headers=fresh_ip())
    assert res.status_code == 201
    assert res.json()["note"] is None


def test_yesterday_allowed(client, slugs):
    y = (today_taipei() - dt.timedelta(days=1)).isoformat()
    res = client.post(f"/api/locations/{slugs[0]}/reports", json=body(date=y), headers=fresh_ip())
    assert res.status_code == 201


def test_unknown_slug_404(client):
    res = client.post("/api/locations/nope/reports", json=body(), headers=fresh_ip())
    assert res.status_code == 404
    assert client.get("/api/locations/nope/reports").status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        body(date=(today_taipei() - dt.timedelta(days=2)).isoformat()),
        body(date=(today_taipei() + dt.timedelta(days=1)).isoformat()),
        body(activity="surf", visibility_m=5),
        body(note="字" * 141),
        body(visibility_m=41),
        body(visibility_m=-1),
        body(feeling="great"),
        body(activity="scuba"),
    ],
)
def test_invalid_422(client, slugs, payload):
    res = client.post(f"/api/locations/{slugs[0]}/reports", json=payload, headers=fresh_ip())
    assert res.status_code == 422


def test_note_140_ok(client, slugs):
    res = client.post(f"/api/locations/{slugs[0]}/reports", json=body(note="字" * 140), headers=fresh_ip())
    assert res.status_code == 201


def test_duplicate_409(client, slugs):
    h = fresh_ip()
    assert client.post(f"/api/locations/{slugs[1]}/reports", json=body(), headers=h).status_code == 201
    assert client.post(f"/api/locations/{slugs[1]}/reports", json=body(), headers=h).status_code == 409
    # 不同活動、不同地區都不算重複
    assert client.post(f"/api/locations/{slugs[1]}/reports", json=body(activity="surf"), headers=h).status_code == 201
    assert client.post(f"/api/locations/{slugs[2]}/reports", json=body(), headers=h).status_code == 201


def test_daily_limit_429(client, slugs):
    h = fresh_ip()
    for s in slugs[:5]:
        assert client.post(f"/api/locations/{s}/reports", json=body(), headers=h).status_code == 201
    assert client.post(f"/api/locations/{slugs[5]}/reports", json=body(), headers=h).status_code == 429


def test_summary_aggregation(client, slugs):
    slug = slugs[-1]
    url = f"/api/locations/{slug}/reports"
    empty = client.get(url).json()
    assert empty == {"count": 0, "by_feeling": {"good": 0, "ok": 0, "bad": 0}, "avg_visibility_m": None, "recent": []}

    client.post(url, json=body(feeling="good", visibility_m=10), headers=fresh_ip())
    client.post(url, json=body(feeling="good", visibility_m=15), headers=fresh_ip())
    client.post(url, json=body(feeling="bad", visibility_m=5), headers=fresh_ip())
    client.post(url, json=body(feeling="ok", activity="surf"), headers=fresh_ip())

    data = client.get(url).json()
    assert data["count"] == 4
    assert data["by_feeling"] == {"good": 2, "ok": 1, "bad": 1}
    assert data["avg_visibility_m"] == 10.0
    assert len(data["recent"]) == 4
    assert data["recent"][0]["feeling"] == "ok"  # 最新的在前
    assert all("ip_hash" not in r for r in data["recent"])

    assert client.get(url + "?days=0").status_code == 422
    assert client.get(url + "?days=31").status_code == 422
    assert client.get(url + "?days=30").status_code == 200


def test_recent_capped_at_10(client, slugs):
    slug = slugs[-2]
    for _ in range(12):
        client.post(f"/api/locations/{slug}/reports", json=body(), headers=fresh_ip())
    data = client.get(f"/api/locations/{slug}/reports").json()
    assert data["count"] == 12
    assert len(data["recent"]) == 10


def test_ip_hash_stored_not_raw_ip(client, slugs):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Report

    h = {"X-Forwarded-For": "198.51.100.77"}
    client.post(f"/api/locations/{slugs[3]}/reports", json=body(), headers=h)
    with SessionLocal() as db:
        rows = db.scalars(select(Report)).all()
        assert rows
        assert all(len(r.ip_hash) == 64 and "198.51.100.77" not in r.ip_hash for r in rows)
