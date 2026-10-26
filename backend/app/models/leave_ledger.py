from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, _now
from app.db.types import UTCDateTime


class LeaveLedger(Base):
    """Append-only. Credits are positive, debits negative. Rows are never updated or deleted."""

    __tablename__ = "leave_ledger"
    __table_args__ = (
        Index("ix_ledger_emp_type_year", "employee_id", "leave_type_id", "year"),
        Index("ix_ledger_reference", "reference_type", "reference_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"))
    year: Mapped[int] = mapped_column(Integer)
    txn_type: Mapped[str] = mapped_column(String(20))
    days: Mapped[float] = mapped_column(Numeric(7, 2, asdecimal=False))
    reference_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
