from datetime import date

from sqlalchemy import Date, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import HolidayType
from app.db.base import Base, TimestampMixin


class Holiday(TimestampMixin, Base):
    __tablename__ = "holidays"
    __table_args__ = (UniqueConstraint("date", "name", name="uq_holiday_date_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    name: Mapped[str] = mapped_column(String(150))
    holiday_type: Mapped[str] = mapped_column(String(16), default=HolidayType.PUBLIC.value)
    scope: Mapped[str] = mapped_column(String(64), default="ALL")
