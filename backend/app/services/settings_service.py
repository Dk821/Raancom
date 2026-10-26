from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.models.company_setting import CompanySetting

WEEKDAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def get_settings(db: Session) -> CompanySetting:
    row = db.scalar(select(CompanySetting).where(CompanySetting.id == 1))
    if row is None:
        row = CompanySetting(id=1)
        db.add(row)
        db.flush()
    return row


def get_tz(settings: CompanySetting) -> ZoneInfo:
    try:
        return ZoneInfo(settings.timezone)
    except Exception:  # unknown tz name -> safe fallback
        return ZoneInfo("UTC")


def weekly_off_set(settings: CompanySetting) -> set[int]:
    codes = {c.strip().upper() for c in (settings.weekly_offs or "").split(",") if c.strip()}
    return {i for i, c in enumerate(WEEKDAY_CODES) if c in codes}


def to_local(dt: datetime, settings: CompanySetting) -> datetime:
    return dt.astimezone(get_tz(settings))


def local_today(settings: CompanySetting) -> date:
    return clock.now_utc().astimezone(get_tz(settings)).date()
