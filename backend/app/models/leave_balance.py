from sqlalchemy import ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class LeaveBalance(TimestampMixin, Base):
    """Cached running balance. The ledger is the source of truth; both are updated
    in the same transaction while this row is locked (SELECT ... FOR UPDATE)."""

    __tablename__ = "leave_balances"
    __table_args__ = (UniqueConstraint("employee_id", "leave_type_id", "year", name="uq_balance_emp_type_year"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"))
    year: Mapped[int] = mapped_column(Integer)
    balance: Mapped[float] = mapped_column(Numeric(7, 2, asdecimal=False), default=0)
