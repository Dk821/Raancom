from datetime import datetime

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, _now
from app.db.types import UTCDateTime


class LeaveApproval(Base):
    """Immutable history of every submission, decision, edit and cancellation."""

    __tablename__ = "leave_approvals"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("leave_requests.id"), index=True)
    step: Mapped[str] = mapped_column(String(24))  # EMPLOYEE / MANAGER / HR / OWNER / CANCELLATION
    action: Mapped[str] = mapped_column(String(24))  # SUBMITTED, APPROVED, REJECTED, RETURNED, ...
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)

    request: Mapped["LeaveRequest"] = relationship(back_populates="approvals")  # noqa: F821
    actor: Mapped["User"] = relationship()  # noqa: F821
