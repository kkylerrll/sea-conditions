from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import DailyCondition, Location
from ..schemas import ConditionOut, LocationWithConditions
from ..tz import today_taipei

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


@router.get("/locations", response_model=list[LocationWithConditions])
def list_locations(db: Session = Depends(get_db)):
    today = today_taipei()
    locations = db.scalars(
        select(Location).options(selectinload(Location.conditions)).order_by(Location.id)
    ).all()

    out: list[LocationWithConditions] = []
    for loc in locations:
        by_date = _preferred(loc.conditions)
        upcoming = [by_date[d] for d in sorted(by_date) if d >= today]
        item = LocationWithConditions.model_validate(loc)
        item.today = ConditionOut.model_validate(upcoming[0]) if upcoming else None
        item.forecast = [ConditionOut.model_validate(c) for c in upcoming[:4]]
        out.append(item)
    return out


@router.get("/locations/{slug}", response_model=LocationWithConditions)
def get_location(slug: str, db: Session = Depends(get_db)):
    today = today_taipei()
    loc = db.scalar(
        select(Location).options(selectinload(Location.conditions)).where(Location.slug == slug)
    )
    if loc is None:
        raise HTTPException(status_code=404, detail="找不到這個潛點")

    by_date = _preferred(loc.conditions)
    upcoming = [by_date[d] for d in sorted(by_date) if d >= today]
    item = LocationWithConditions.model_validate(loc)
    item.today = ConditionOut.model_validate(upcoming[0]) if upcoming else None
    item.forecast = [ConditionOut.model_validate(c) for c in upcoming[:4]]
    return item
