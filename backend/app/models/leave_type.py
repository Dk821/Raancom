from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class LeaveType(TimestampMixin, Base):
    __tablename__ = "leave_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True)
    allows_half_day: Mapped[bool] = mapped_column(Boolean, default=True)
    # False => no balance tracking (e.g. unpaid / loss-of-pay leave).
    balance_required: Mapped[bool] = mapped_column(Boolean, default=True)
    annual_entitlement: Mapped[float] = mapped_column(Numeric(6, 2, asdecimal=False), default=0)
    carry_forward_max: Mapped[float] = mapped_column(Numeric(6, 2, asdecimal=False), default=0)
    requires_attachment: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
