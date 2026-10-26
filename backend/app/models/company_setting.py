from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class CompanySetting(TimestampMixin, Base):
    """Single-row table (id = 1). Every policy value here is a *proposed default*
    from the architecture document and is editable by the Owner until the client
    confirms the Section 14 decisions."""

    __tablename__ = "company_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_name: Mapped[str] = mapped_column(String(150), default="Raancom")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")

    # --- attendance ---
    weekly_offs: Mapped[str] = mapped_column(String(40), default="SUN")  # CSV of MON..SUN
    outside_radius_action: Mapped[str] = mapped_column(String(8), default="FLAG")  # FLAG | BLOCK
    max_gps_accuracy_m: Mapped[int] = mapped_column(Integer, default=100)
    max_shift_hours: Mapped[int] = mapped_column(Integer, default=16)
    correction_window_days: Mapped[int] = mapped_column(Integer, default=30)
    manager_can_review_corrections: Mapped[bool] = mapped_column(Boolean, default=True)
    late_rule_enabled: Mapped[bool] = mapped_column(Boolean, default=False)  # pending client approval
    late_count_for_half_day: Mapped[int] = mapped_column(Integer, default=3)
    photo_retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)  # pending client approval

    # --- leave ---
    hr_second_level_leave: Mapped[bool] = mapped_column(Boolean, default=False)
    weekends_count_as_leave: Mapped[bool] = mapped_column(Boolean, default=False)
    holidays_count_as_leave: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_backdated_leave: Mapped[bool] = mapped_column(Boolean, default=True)
    backdated_max_days: Mapped[int] = mapped_column(Integer, default=7)
    insufficient_balance_action: Mapped[str] = mapped_column(String(8), default="BLOCK")  # BLOCK | ALLOW
    approved_leave_cancel_needs_approval: Mapped[bool] = mapped_column(Boolean, default=True)

    # --- permissions delegated by the Owner ---
    hr_can_manage_managers: Mapped[bool] = mapped_column(Boolean, default=True)
    hr_can_edit_leave_policy: Mapped[bool] = mapped_column(Boolean, default=False)

    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
