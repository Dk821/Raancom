"""Leave rules: chargeable days, validation, balances and the append-only ledger."""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    ACTIVE_LEAVE_STATUSES,
    PENDING_LEAVE_STATUSES,
    HalfDaySession,
    LedgerType,
)
from app.models.company_setting import CompanySetting
from app.models.employee import Employee
from app.models.holiday import Holiday
from app.models.leave_balance import LeaveBalance
from app.models.leave_ledger import LeaveLedger
from app.models.leave_request import LeaveRequest
from app.models.leave_type import LeaveType
from app.services.settings_service import local_today, weekly_off_set

REF_REQUEST = "LEAVE_REQUEST"


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


# --------------------------------------------------------------------------- days
def chargeable_dates(db: Session, settings: CompanySetting, start: date, end: date) -> list[date]:
    holidays = set(db.scalars(select(Holiday.date).where(Holiday.date >= start, Holiday.date <= end)))
    offs = weekly_off_set(settings)
    out = []
    for d in daterange(start, end):
        if d.weekday() in offs and not settings.weekends_count_as_leave:
            continue
        if d in holidays and not settings.holidays_count_as_leave:
            continue
        out.append(d)
    return out


def days_by_year(db: Session, settings: CompanySetting, start: date, end: date, is_half: bool) -> dict[int, float]:
    dates = chargeable_dates(db, settings, start, end)
    out: dict[int, float] = defaultdict(float)
    for d in dates:
        out[d.year] += 0.5 if is_half else 1.0
    return dict(out)


# ------------------------------------------------------------------------ balances
def get_or_create_balance(db: Session, employee_id: int, type_id: int, year: int, lock: bool = False) -> LeaveBalance:
    stmt = select(LeaveBalance).where(
        LeaveBalance.employee_id == employee_id, LeaveBalance.leave_type_id == type_id, LeaveBalance.year == year
    )
    if lock:
        stmt = stmt.with_for_update()
    row = db.scalar(stmt)
    if row is None:
        try:
            with db.begin_nested():
                db.add(LeaveBalance(employee_id=employee_id, leave_type_id=type_id, year=year, balance=0))
                db.flush()
        except IntegrityError:
            pass
        row = db.scalar(stmt)
    return row


def read_balance(db: Session, employee_id: int, type_id: int, year: int) -> float:
    """Read-only balance lookup (does not create rows)."""
    val = db.scalar(
        select(LeaveBalance.balance).where(
            LeaveBalance.employee_id == employee_id, LeaveBalance.leave_type_id == type_id, LeaveBalance.year == year
        )
    )
    return float(val) if val is not None else 0.0


def post_ledger(
    db: Session, employee_id: int, type_id: int, year: int, txn_type: LedgerType, days: float,
    ref_type: str | None = None, ref_id: int | None = None, note: str | None = None, actor_user_id: int | None = None,
) -> LeaveBalance:
    """Appends a ledger row and updates the cached balance while holding a row lock."""
    bal = get_or_create_balance(db, employee_id, type_id, year, lock=True)
    bal.balance = round(float(bal.balance) + days, 2)
    db.add(
        LeaveLedger(
            employee_id=employee_id, leave_type_id=type_id, year=year, txn_type=txn_type.value, days=days,
            reference_type=ref_type, reference_id=ref_id, note=note, actor_user_id=actor_user_id,
        )
    )
    return bal


def pending_days(db: Session, settings: CompanySetting, employee_id: int, type_id: int, year: int,
                 exclude_request_id: int | None = None) -> float:
    stmt = select(LeaveRequest).where(
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.leave_type_id == type_id,
        LeaveRequest.status.in_(PENDING_LEAVE_STATUSES),
    )
    total = 0.0
    for r in db.scalars(stmt):
        if exclude_request_id and r.id == exclude_request_id:
            continue
        total += days_by_year(db, settings, r.start_date, r.end_date, r.is_half_day).get(year, 0.0)
    return total


def available_balance(db: Session, settings: CompanySetting, employee_id: int, type_id: int, year: int,
                      exclude_request_id: int | None = None) -> float:
    return read_balance(db, employee_id, type_id, year) - pending_days(db, settings, employee_id, type_id, year, exclude_request_id)


def allocate_entitlements(db: Session, employee: Employee, year: int, actor_user_id: int | None) -> int:
    """Idempotent: credits each tracked leave type's annual entitlement once per year."""
    n = 0
    for lt in db.scalars(select(LeaveType).where(LeaveType.is_active.is_(True), LeaveType.balance_required.is_(True))):
        if not lt.annual_entitlement or lt.annual_entitlement <= 0:
            continue
        exists = db.scalar(
            select(func.count(LeaveLedger.id)).where(
                LeaveLedger.employee_id == employee.id, LeaveLedger.leave_type_id == lt.id,
                LeaveLedger.year == year, LeaveLedger.txn_type == LedgerType.ALLOCATION.value,
            )
        )
        if exists:
            continue
        post_ledger(db, employee.id, lt.id, year, LedgerType.ALLOCATION, float(lt.annual_entitlement),
                    note=f"Annual entitlement {year}", actor_user_id=actor_user_id)
        n += 1
    return n


def roll_over_year(db: Session, year: int, actor_user_id: int | None) -> dict:
    """Carry forward from year-1 (capped per leave type) then allocate entitlements. Idempotent."""
    from app.core.enums import EmploymentStatus

    carried = allocated = 0
    types = list(db.scalars(select(LeaveType).where(LeaveType.is_active.is_(True), LeaveType.balance_required.is_(True))))
    for emp in db.scalars(select(Employee).where(Employee.status == EmploymentStatus.ACTIVE.value)):
        for lt in types:
            if lt.carry_forward_max and lt.carry_forward_max > 0:
                done = db.scalar(
                    select(func.count(LeaveLedger.id)).where(
                        LeaveLedger.employee_id == emp.id, LeaveLedger.leave_type_id == lt.id,
                        LeaveLedger.year == year, LeaveLedger.txn_type == LedgerType.CARRY_FORWARD.value,
                    )
                )
                if not done:
                    cf = min(max(read_balance(db, emp.id, lt.id, year - 1), 0.0), float(lt.carry_forward_max))
                    if cf > 0:
                        post_ledger(db, emp.id, lt.id, year, LedgerType.CARRY_FORWARD, cf,
                                    note=f"Carried forward from {year - 1}", actor_user_id=actor_user_id)
                        carried += 1
        allocated += allocate_entitlements(db, emp, year, actor_user_id)
    return {"year": year, "carry_forward_entries": carried, "allocation_entries": allocated}


def balance_summary(db: Session, settings: CompanySetting, employee_id: int, year: int) -> list[dict]:
    out = []
    for lt in db.scalars(select(LeaveType).where(LeaveType.is_active.is_(True)).order_by(LeaveType.id)):
        sums = dict(
            db.execute(
                select(LeaveLedger.txn_type, func.coalesce(func.sum(LeaveLedger.days), 0))
                .where(LeaveLedger.employee_id == employee_id, LeaveLedger.leave_type_id == lt.id, LeaveLedger.year == year)
                .group_by(LeaveLedger.txn_type)
            ).all()
        )
        allocated = float(sums.get("ALLOCATION", 0)) + float(sums.get("CARRY_FORWARD", 0))
        used = -(float(sums.get("DEBIT", 0)) + float(sums.get("REVERSAL", 0)))
        adjusted = float(sums.get("ADJUSTMENT", 0))
        pend = pending_days(db, settings, employee_id, lt.id, year) if lt.balance_required else 0.0
        balance = read_balance(db, employee_id, lt.id, year) if lt.balance_required else 0.0
        out.append(
            {
                "leave_type_id": lt.id, "code": lt.code, "name": lt.name, "year": year, "is_paid": lt.is_paid,
                "tracked": lt.balance_required, "allocated": allocated, "adjusted": adjusted,
                "used": round(used, 2), "pending": round(pend, 2), "balance": round(balance, 2),
                "available": round(balance - pend, 2),
            }
        )
    return out


# ------------------------------------------------------------------- validation
@dataclass
class LeaveCheck:
    days: float
    by_year: dict[int, float]
    warnings: list[str] = field(default_factory=list)
    available: dict[int, float] = field(default_factory=dict)


def validate_request(
    db: Session, settings: CompanySetting, employee: Employee, leave_type: LeaveType, start: date, end: date,
    is_half: bool, half_session: str | None, exclude_request_id: int | None = None,
) -> LeaveCheck:
    if not leave_type.is_active:
        raise HTTPException(422, "This leave type is not active")
    if end < start:
        raise HTTPException(422, "End date cannot be before start date")
    if (end - start).days > 366:
        raise HTTPException(422, "Leave range is too long")
    if start < employee.joining_date:
        raise HTTPException(422, "Leave cannot start before the joining date")
    if is_half:
        if not leave_type.allows_half_day:
            raise HTTPException(422, f"{leave_type.name} does not allow half-day leave")
        if start != end:
            raise HTTPException(422, "A half-day request must be for a single date")
        if half_session not in (HalfDaySession.FIRST_HALF.value, HalfDaySession.SECOND_HALF.value):
            raise HTTPException(422, "Select first half or second half")
    today = local_today(settings)
    if start < today:
        if not settings.allow_backdated_leave:
            raise HTTPException(422, "Backdated leave is not allowed")
        if (today - start).days > settings.backdated_max_days:
            raise HTTPException(422, f"Leave can be backdated by at most {settings.backdated_max_days} days")

    by_year = days_by_year(db, settings, start, end, is_half)
    total = round(sum(by_year.values()), 2)
    if total <= 0:
        raise HTTPException(422, "The selected dates contain no chargeable days (weekly off / holidays)")

    # Overlap with the employee's other active requests.
    stmt = select(LeaveRequest).where(
        LeaveRequest.employee_id == employee.id,
        LeaveRequest.status.in_(ACTIVE_LEAVE_STATUSES),
        LeaveRequest.start_date <= end,
        LeaveRequest.end_date >= start,
    )
    for other in db.scalars(stmt):
        if exclude_request_id and other.id == exclude_request_id:
            continue
        both_half_same_day = (
            is_half and other.is_half_day and other.start_date == start
            and other.half_day_session != half_session
        )
        if not both_half_same_day:
            raise HTTPException(409, f"Overlaps an existing leave request ({other.start_date} to {other.end_date})")

    check = LeaveCheck(days=total, by_year=by_year)
    if leave_type.balance_required:
        for year, need in by_year.items():
            avail = available_balance(db, settings, employee.id, leave_type.id, year, exclude_request_id)
            check.available[year] = round(avail, 2)
            if avail + 1e-9 < need:
                msg = f"Insufficient {leave_type.code} balance for {year}: need {need:g}, available {avail:g}"
                if settings.insufficient_balance_action == "BLOCK":
                    raise HTTPException(422, msg)
                check.warnings.append(msg)
    return check


def reverse_debits(db: Session, request_id: int, actor_user_id: int | None, note: str) -> None:
    """Writes REVERSAL rows that mirror whatever is still debited for this request."""
    rows = db.execute(
        select(LeaveLedger.leave_type_id, LeaveLedger.employee_id, LeaveLedger.year, func.sum(LeaveLedger.days))
        .where(
            LeaveLedger.reference_type == REF_REQUEST, LeaveLedger.reference_id == request_id,
            LeaveLedger.txn_type.in_([LedgerType.DEBIT.value, LedgerType.REVERSAL.value]),
        )
        .group_by(LeaveLedger.leave_type_id, LeaveLedger.employee_id, LeaveLedger.year)
    ).all()
    for type_id, emp_id, year, net in rows:
        net = float(net)
        if net < 0:
            post_ledger(db, emp_id, type_id, year, LedgerType.REVERSAL, -net, REF_REQUEST, request_id, note, actor_user_id)
