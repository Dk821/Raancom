"""String enums shared across models, services and schemas.

Stored as plain VARCHAR columns (not native DB enums) so adding a value never
requires an ALTER TABLE on MySQL.
"""
from enum import Enum


class Role(str, Enum):
    OWNER = "OWNER"
    HR = "HR"
    REPORTING_MANAGER = "REPORTING_MANAGER"
    EMPLOYEE = "EMPLOYEE"


class EmploymentStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class AttendanceMode(str, Enum):
    OFFICE = "OFFICE"
    OUTSIDE_WORK = "OUTSIDE_WORK"
    WFH = "WFH"


class EventType(str, Enum):
    CHECK_IN = "CHECK_IN"
    CHECK_OUT = "CHECK_OUT"


class GeofenceStatus(str, Enum):
    INSIDE = "INSIDE"
    OUTSIDE = "OUTSIDE"
    LOW_ACCURACY = "LOW_ACCURACY"
    NO_LOCATION = "NO_LOCATION"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class ReviewStatus(str, Enum):
    OK = "OK"
    FLAGGED = "FLAGGED"
    REVIEWED = "REVIEWED"


class DayStatus(str, Enum):
    PRESENT = "PRESENT"
    HALF_DAY = "HALF_DAY"
    ABSENT = "ABSENT"
    LEAVE = "LEAVE"
    HOLIDAY = "HOLIDAY"
    WEEKLY_OFF = "WEEKLY_OFF"
    INCOMPLETE = "INCOMPLETE"
    CHECKED_IN = "CHECKED_IN"
    NOT_MARKED = "NOT_MARKED"


class CorrectionStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class LeaveStatus(str, Enum):
    PENDING_MANAGER = "PENDING_MANAGER"
    PENDING_HR = "PENDING_HR"
    NEEDS_CHANGES = "NEEDS_CHANGES"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLATION_REQUESTED = "CANCELLATION_REQUESTED"
    CANCELLED = "CANCELLED"


# Statuses that still occupy the calendar / count against overlap checks.
ACTIVE_LEAVE_STATUSES = (
    LeaveStatus.PENDING_MANAGER.value,
    LeaveStatus.PENDING_HR.value,
    LeaveStatus.NEEDS_CHANGES.value,
    LeaveStatus.APPROVED.value,
    LeaveStatus.CANCELLATION_REQUESTED.value,
)
PENDING_LEAVE_STATUSES = (
    LeaveStatus.PENDING_MANAGER.value,
    LeaveStatus.PENDING_HR.value,
    LeaveStatus.NEEDS_CHANGES.value,
)
# Statuses in which the leave is in force (balance already debited).
IN_FORCE_LEAVE_STATUSES = (
    LeaveStatus.APPROVED.value,
    LeaveStatus.CANCELLATION_REQUESTED.value,
)


class LedgerType(str, Enum):
    ALLOCATION = "ALLOCATION"
    CARRY_FORWARD = "CARRY_FORWARD"
    DEBIT = "DEBIT"
    REVERSAL = "REVERSAL"
    ADJUSTMENT = "ADJUSTMENT"


class HalfDaySession(str, Enum):
    FIRST_HALF = "FIRST_HALF"
    SECOND_HALF = "SECOND_HALF"


class HolidayType(str, Enum):
    PUBLIC = "PUBLIC"
    COMPANY = "COMPANY"
