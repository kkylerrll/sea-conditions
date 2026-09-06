from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

# 注意：SQLAlchemy 在 Python 3.9 下無法解析字串化的 `str | None`，用 Optional[...] 代替。


class Base(DeclarativeBase):
    pass


class Location(Base):
    """潛點/浪點基本資料。第一層用固定清單，不做管理後台。"""

    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[Optional[str]] = mapped_column(String(120))
    region: Mapped[str] = mapped_column(String(60))            # 例：屏東 · 離島
    blurb: Mapped[str] = mapped_column(Text, default="")
    spots: Mapped[list] = mapped_column(JSON, default=list)     # 熱門潛點名稱，例：["花瓶石","美人洞"]
    activities: Mapped[list] = mapped_column(JSON, default=list)  # ["scuba","freedive","snorkel","surf"]
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)

    # 資料源提示（第二步用）
    cwa_marine_zone: Mapped[Optional[str]] = mapped_column(String(40))   # CWA 沿岸海域名稱
    cwa_tide_station: Mapped[Optional[str]] = mapped_column(String(40))  # CWA 潮汐站名

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conditions: Mapped[list["DailyCondition"]] = relationship(
        back_populates="location",
        cascade="all, delete-orphan",
        order_by="DailyCondition.date",
    )

    # --- 第二層預留（本次不建表，先記在這裡當設計備忘） ---
    # user_spots        使用者新增的地點（待審 flag 之後才加）
    # comments          心得留言（純文字 + 照片，依讚數排序）
    # condition_reports 使用者實測海況回報，用來校正 AI 建議


class DailyCondition(Base):
    """某地點某一天的海況快照，含燈號與 AI 建議。同地點同日可有多個來源。"""

    __tablename__ = "daily_conditions"
    __table_args__ = (
        UniqueConstraint("location_id", "date", "source", name="uq_condition_loc_date_source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    source: Mapped[str] = mapped_column(String(20), default="mock")  # mock | openmeteo | cwa
    fetched_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 海況數據（缺就留 NULL）
    wave_height_m: Mapped[Optional[float]] = mapped_column(Float)
    wave_period_s: Mapped[Optional[float]] = mapped_column(Float)
    wave_dir: Mapped[Optional[str]] = mapped_column(String(8))      # 主波浪來向羅盤字串，例：NE（與 wind_dir 一致）
    wind_speed_ms: Mapped[Optional[float]] = mapped_column(Float)
    wind_scale: Mapped[Optional[int]] = mapped_column(Integer)      # 蒲福風級 0–12
    wind_dir: Mapped[Optional[str]] = mapped_column(String(8))      # 例：NE
    gust_ms: Mapped[Optional[float]] = mapped_column(Float)
    water_temp_c: Mapped[Optional[float]] = mapped_column(Float)
    visibility_m: Mapped[Optional[float]] = mapped_column(Float)    # 水下能見度估計（CWA 無此資料）
    tide_high: Mapped[Optional[str]] = mapped_column(String(40))    # 例："05:12 / 17:40"
    tide_low: Mapped[Optional[str]] = mapped_column(String(40))

    # 燈號（第三步）
    rating: Mapped[str] = mapped_column(String(10), default="unknown")  # green | yellow | red | unknown
    rating_score: Mapped[Optional[float]] = mapped_column(Float)        # 0–100，越高越適合
    rating_reasons: Mapped[list] = mapped_column(JSON, default=list)

    # AI 建議（第四步）
    advice_text: Mapped[Optional[str]] = mapped_column(Text)
    advice_model: Mapped[Optional[str]] = mapped_column(String(40))

    raw: Mapped[Optional[dict]] = mapped_column(JSON)  # 原始 API payload，方便除錯與日後校正

    location: Mapped["Location"] = relationship(back_populates="conditions")
