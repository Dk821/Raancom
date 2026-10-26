from datetime import date, time

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Shift(TimestampMixin, Base):
    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    grace_minutes: Mapped[int] = mapped_column(Integer, default=0)
    half_day_hours: Mapped[float] = mapped_column(Numeric(4, 2, asdecimal=False), default=4)
    full_day_hours: Mapped[float] = mapped_column(Numeric(4, 2, asdecimal=False), default=8)
    is_overnight: Mapped[bool] = mapped_column(Boolean, default=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class EmployeeShift(TimestampMixin, Base):
    __tablename__ = "employee_shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("shifts.id"))
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
