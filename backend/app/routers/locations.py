from __future__ import annotations

import datetime as dt
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..db import get_db
from ..models import DailyCondition, Location, Report
from ..schemas import (
    ConditionOut,
    FeelingCounts,
    LocationWithConditions,
    ReportIn,
    ReportOut,
    ReportSummary,
    SpotOut,
)
from ..tz import TAIPEI, now_taipei, today_taipei

DAILY_REPORT_LIMIT = 5

router = APIRouter(prefix="/api", tags=["locations"])


def _preferred(conditions: list[DailyCondition]) -> dict[dt.date, DailyCondition]:
    """同一天有多個來源時，取「非 mock」優先（openmeteo > cwa > mock）。"""

    priority = {"openmeteo": 3, "cwa": 2, "mock": 1}
    best: dict[dt.date, DailyCondition] = {}
    for c in conditions:
        cur = best.get(c.date)
        if cur is None or priority.get(c.source, 0) > priority.get(cur.source, 0):
            best[c.date] = c
    return best


def _build(loc: Location, today: dt.date) -> LocationWithConditions:
    by_date = _preferred(loc.conditions)
    upcoming = [by_date[d] for d in sorted(by_date) if d >= today]
    item = LocationWithConditions.model_validate(loc)
    item.today = ConditionOut.model_validate(upcoming[0]) if upcoming else None
    item.forecast = [ConditionOut.model_validate(c) for c in upcoming[:4]]
    item.spot_list = [SpotOut.model_validate(s) for s in loc.spots_rel]
    return item


@router.get("/locations", response_model=list[LocationWithConditions])
def list_locations(db: Session = Depends(get_db)):
    today = today_taipei()
    locations = db.scalars(
        select(Location)
        .options(selectinload(Location.conditions), selectinload(Location.spots_rel))
        .order_by(Location.id)
    ).all()
    return [_build(loc, today) for loc in locations]


@router.get("/locations/{slug}", response_model=LocationWithConditions)
def get_location(slug: str, db: Session = Depends(get_db)):
    today = today_taipei()
    loc = db.scalar(
        select(Location)
        .options(selectinload(Location.conditions), selectinload(Location.spots_rel))
        .where(Location.slug == slug)
    )
    if loc is None:
        raise HTTPException(status_code=404, detail="找不到這個潛點")
    return _build(loc, today)


# ───────────── 使用者實測回報 ─────────────


def _client_ip(request: Request) -> str:
    """Render 在 proxy 後面：有 X-Forwarded-For 取第一個，否則用連線來源。"""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _ip_hash(ip: str) -> str:
    return hashlib.sha256((ip + settings.report_salt).encode("utf-8")).hexdigest()


def _get_location(db: Session, slug: str) -> Location:
    loc = db.scalar(select(Location).where(Location.slug == slug))
    if loc is None:
        raise HTTPException(status_code=404, detail="找不到這個潛點")
    return loc


@router.post("/locations/{slug}/reports", response_model=ReportOut, status_code=201)
def create_report(slug: str, body: ReportIn, request: Request, db: Session = Depends(get_db)):
    loc = _get_location(db, slug)
    ip_hash = _ip_hash(_client_ip(request))

    dup = db.scalar(
        select(func.count())
        .select_from(Report)
        .where(
            Report.ip_hash == ip_hash,
            Report.location_id == loc.id,
            Report.date == body.date,
            Report.activity == body.activity,
        )
    )
    if dup:
        raise HTTPException(status_code=409, detail="你已經回報過這個地區這一天的這項活動了")

    # 台灣當日 00:00 起算（created_at 一律存 UTC）
    day_start = (
        dt.datetime.combine(now_taipei().date(), dt.time.min, tzinfo=TAIPEI)
        .astimezone(dt.timezone.utc)
    )
    sent_today = db.scalar(
        select(func.count())
        .select_from(Report)
        .where(Report.ip_hash == ip_hash, Report.created_at >= day_start)
    )
    if (sent_today or 0) >= DAILY_REPORT_LIMIT:
        raise HTTPException(status_code=429, detail="今天回報太多次了，明天再來")

    report = Report(
        location_id=loc.id,
        date=body.date,
        activity=body.activity,
        feeling=body.feeling,
        visibility_m=body.visibility_m,
        note=body.note,
        ip_hash=ip_hash,
        created_at=dt.datetime.now(dt.timezone.utc),
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        # 兩個請求同時進來撞到唯一限制
        db.rollback()
        raise HTTPException(status_code=409, detail="你已經回報過這個地區這一天的這項活動了") from None
    return ReportOut.model_validate(report)


@router.get("/locations/{slug}/reports", response_model=ReportSummary)
def get_reports(
    slug: str,
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
):
    loc = _get_location(db, slug)
    since = today_taipei() - dt.timedelta(days=days - 1)
    rows = db.scalars(
        select(Report)
        .where(Report.location_id == loc.id, Report.date >= since)
        .order_by(Report.created_at.desc(), Report.id.desc())
    ).all()

    counts = FeelingCounts()
    for r in rows:
        setattr(counts, r.feeling, getattr(counts, r.feeling) + 1)
    vis = [r.visibility_m for r in rows if r.visibility_m is not None]
    return ReportSummary(
        count=len(rows),
        by_feeling=counts,
        avg_visibility_m=round(sum(vis) / len(vis), 1) if vis else None,
        recent=[ReportOut.model_validate(r) for r in rows[:10]],
    )
