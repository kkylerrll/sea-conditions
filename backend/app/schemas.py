from __future__ import annotations

import datetime as dt
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator

# Python 3.9 相容：用 Optional[...] / List[...]，不用 `X | None`。


class ActivityRating(BaseModel):
    rating: str
    score: Optional[float] = None
    reasons: List[str] = []


class Ratings(BaseModel):
    dive: Optional[ActivityRating] = None
    surf: Optional[ActivityRating] = None


class SlotOut(BaseModel):
    key: str
    label: str
    start: str
    end: str
    wave_height_m: Optional[float] = None
    wave_period_s: Optional[float] = None
    wave_dir: Optional[str] = None
    wind_speed_ms: Optional[float] = None
    wind_scale: Optional[int] = None
    wind_dir: Optional[str] = None
    gust_ms: Optional[float] = None
    ratings: Optional[Ratings] = None


class ConditionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: dt.date
    source: str
    fetched_at: Optional[dt.datetime] = None

    wave_height_m: Optional[float] = None
    wave_period_s: Optional[float] = None
    wave_dir: Optional[str] = None
    wind_speed_ms: Optional[float] = None
    wind_scale: Optional[int] = None
    wind_dir: Optional[str] = None
    gust_ms: Optional[float] = None
    water_temp_c: Optional[float] = None
    visibility_m: Optional[float] = None
    tide_high: Optional[str] = None
    tide_low: Optional[str] = None

    rating: str
    rating_score: Optional[float] = None
    rating_reasons: List[str] = []
    ratings: Optional[Ratings] = None
    slots: Optional[List[SlotOut]] = None

    advice_text: Optional[str] = None
    advice_model: Optional[str] = None

    @field_validator("fetched_at")
    @classmethod
    def _fetched_at_utc(cls, v):
        # SQLite 讀回來沒有時區（存的是 UTC）；補上，前端才能正確換算成台北時間
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=dt.timezone.utc)
        return v


class SpotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    name_en: Optional[str] = None
    lat: float
    lon: float
    coord_approx: bool = False
    activities: List[str] = []
    bottom: Optional[str] = None
    facing_deg: Optional[int] = None
    shelter: Optional[str] = None
    level: Optional[str] = None
    entry: Optional[str] = None
    depth_min_m: Optional[float] = None
    depth_max_m: Optional[float] = None
    blurb: str = ""


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    name_en: Optional[str] = None
    region: str
    blurb: str
    spots: List[str] = []
    activities: List[str] = []
    lat: float
    lon: float


class LocationWithConditions(LocationOut):
    today: Optional[ConditionOut] = None
    forecast: List[ConditionOut] = []
    spot_list: List[SpotOut] = []


class RefreshFailure(BaseModel):
    location: str
    error: str


class RefreshResult(BaseModel):
    updated_locations: int
    days: int
    source: str
    llm: bool
    # 以下為可見性欄位：背景模式下沒有結果，故皆為選填
    total_locations: Optional[int] = None
    failed: List[RefreshFailure] = []
    tide_failed: Optional[int] = None
