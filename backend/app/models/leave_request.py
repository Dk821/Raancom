from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import LeaveStatus
from app.db.base import Base, TimestampMixin
from app.db.types import UTCDateTime


class LeaveRequest(TimestampMixin, Base):
    __tablename__ = "leave_requests"
    __table_args__ = (Index("ix_leave_emp_dates", "employee_id", "start_date", "end_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    is_half_day: Mapped[bool] = mapped_column(Boolean, default=False)
    half_day_session: Mapped[str | None] = mapped_column(String(16), nullable=True)
    days: Mapped[float] = mapped_column(Numeric(6, 2, asdecimal=False))
    reason: Mapped[str] = mapped_column(Text)
    attachment_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default=LeaveStatus.PENDING_MANAGER.value, index=True)
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    employee: Mapped["Employee"] = relationship()  # noqa: F821
    leave_type: Mapped["LeaveType"] = relationship()  # noqa: F821
    approvals: Mapped[list["LeaveApproval"]] = relationship(  # noqa: F821
        back_populates="request", order_by="LeaveApproval.id"
    )
