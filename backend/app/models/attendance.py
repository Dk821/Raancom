from datetime import date, datetime

from sqlalchemy import Date, Double, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import GeofenceStatus, ReviewStatus
from app.db.base import Base, _now
from app.db.types import UTCDateTime


class AttendanceEvent(Base):
    """Immutable original attendance record. Never edited; corrections live elsewhere."""

    __tablename__ = "attendance_events"
    __table_args__ = (
        # One check-in and one check-out per attendance date: DB-level duplicate guard.
        UniqueConstraint("employee_id", "attendance_date", "event_type", name="uq_attendance_emp_date_type"),
        Index("ix_attendance_date_emp", "attendance_date", "employee_id"),
        Index("ix_attendance_review", "review_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    attendance_date: Mapped[date] = mapped_column(Date)
    event_type: Mapped[str] = mapped_column(String(16))
    mode: Mapped[str] = mapped_column(String(16), index=True)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)  # server time
    latitude: Mapped[float | None] = mapped_column(Double, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Double, nullable=True)
    accuracy_m: Mapped[float | None] = mapped_column(Double, nullable=True)
    office_id: Mapped[int | None] = mapped_column(ForeignKey("offices.id"), nullable=True)
    distance_m: Mapped[float | None] = mapped_column(Double, nullable=True)
    radius_m: Mapped[int | None] = mapped_column(Integer, nullable=True)
    geofence_status: Mapped[str] = mapped_column(String(20), default=GeofenceStatus.NOT_APPLICABLE.value)
    photo_key: Mapped[str] = mapped_column(String(255))
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_status: Mapped[str] = mapped_column(String(16), default=ReviewStatus.OK.value)
    flag_reasons: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
