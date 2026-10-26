from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import EmploymentStatus
from app.db.base import Base, TimestampMixin
from app.db.types import UTCDateTime


class Employee(TimestampMixin, Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    employee_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(150), index=True)
    department: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    designation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    joining_date: Mapped[date] = mapped_column(Date)
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=EmploymentStatus.ACTIVE.value, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="employee")  # noqa: F821
    manager: Mapped[Optional["Employee"]] = relationship(remote_side="Employee.id")
