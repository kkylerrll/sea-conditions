from __future__ import annotations

import datetime as dt
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Python 3.9 相容：用 Optional[...] / List[...]，不用 `X | None`。


class ActivityRating(BaseModel):
    rating: str
    score: Optional[float] = None
    reasons: list[str] = []
    # 有白天時段時：{"best": 時段key, "worst": 時段key}
    daytime_range: Optional[dict[str, str]] = None


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
    rating_reasons: list[str] = []
    ratings: Optional[Ratings] = None
    slots: Optional[list[SlotOut]] = None

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
    activities: list[str] = []
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
    spots: list[str] = []
    activities: list[str] = []
    lat: float
    lon: float


class LocationWithConditions(LocationOut):
    today: Optional[ConditionOut] = None
    forecast: list[ConditionOut] = []
    spot_list: list[SpotOut] = []


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
    failed: list[RefreshFailure] = []
    tide_failed: Optional[int] = None


# ───────────── 使用者實測回報 ─────────────


class ReportIn(BaseModel):
    date: dt.date
    activity: Literal["dive", "surf"]
    feeling: Literal["good", "ok", "bad"]
    visibility_m: Optional[int] = Field(default=None, ge=0, le=40)
    note: Optional[str] = None

    @field_validator("note")
    @classmethod
    def _clean_note(cls, v):
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if len(v) > 140:
            raise ValueError("備註最多 140 字")
        return v

    @model_validator(mode="after")
    def _check_rules(self):
        from .tz import today_taipei

        today = today_taipei()
        if self.date not in (today, today - dt.timedelta(days=1)):
            raise ValueError("日期只能是台灣時間的今天或昨天")
        if self.visibility_m is not None and self.activity != "dive":
            raise ValueError("只有潛水可以填能見度")
        return self


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: dt.date
    activity: str
    feeling: str
    visibility_m: Optional[int] = None
    note: Optional[str] = None
    created_at: dt.datetime

    @field_validator("created_at")
    @classmethod
    def _created_at_utc(cls, v):
        if v.tzinfo is None:
            return v.replace(tzinfo=dt.timezone.utc)
        return v


class FeelingCounts(BaseModel):
    good: int = 0
    ok: int = 0
    bad: int = 0


class ReportSummary(BaseModel):
    count: int
    by_feeling: FeelingCounts
    avg_visibility_m: Optional[float] = None
    recent: list[ReportOut] = []
