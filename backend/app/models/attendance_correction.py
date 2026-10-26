from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import CorrectionStatus
from app.db.base import Base, _now
from app.db.types import UTCDateTime


class AttendanceCorrection(Base):
    """A requested/approved change for one attendance date. Originals stay untouched."""

    __tablename__ = "attendance_corrections"
    __table_args__ = (Index("ix_corr_emp_date", "employee_id", "attendance_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    attendance_date: Mapped[date] = mapped_column(Date)
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    requested_check_in: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    requested_check_out: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    requested_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default=CorrectionStatus.PENDING.value, index=True)
    is_direct: Mapped[bool] = mapped_column(Boolean, default=False)  # entered by HR/Owner
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
