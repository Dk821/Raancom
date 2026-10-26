"""Attendance capture, daily status computation and corrections.

Original events are immutable. A day's status is *derived* from the events, the approved
correction (if any), approved leave, the holiday calendar, weekly offs and the shift."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import clock
from app.core.enums import (
    IN_FORCE_LEAVE_STATUSES,
    AttendanceMode,
    CorrectionStatus,
    DayStatus,
    EmploymentStatus,
    EventType,
    GeofenceStatus,
    ReviewStatus,
    Role,
)
from app.core.permissions import Principal
from app.models.attendance import AttendanceEvent
from app.models.attendance_correction import AttendanceCorrection
from app.models.employee import Employee
from app.models.holiday import Holiday
from app.models.leave_request import LeaveRequest
from app.models.office import Office
from app.models.shift import EmployeeShift, Shift
from app.services import audit_service, geofence_service, notification_service, storage_service
from app.services.settings_service import get_settings, get_tz, local_today, to_local, weekly_off_set


# --------------------------------------------------------------------- submit
def _clean_remark(remark: str | None) -> str | None:
    r = (remark or "").strip()
    return r[:1000] or None


def submit_event(
    db: Session, p: Principal, event_type: str, mode: str, latitude: float | None, longitude: float | None,
    accuracy_m: float | None, remark: str | None, office_id: int | None, photo: bytes, photo_ext: str, ip: str | None,
) -> AttendanceEvent:
    settings = get_settings(db)
    emp = p.employee
    now = clock.now_utc()
    today = to_local(now, settings).date()

    if (latitude is None) != (longitude is None):
        raise HTTPException(422, "Latitude and longitude must be provided together")
    if latitude is not None and not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(422, "Coordinates are out of range")
    if accuracy_m is not None and accuracy_m < 0:
        raise HTTPException(422, "Accuracy must be positive")
    remark = _clean_remark(remark)
    if mode in (AttendanceMode.OUTSIDE_WORK.value, AttendanceMode.WFH.value) and (not remark or len(remark) < 3):
        raise HTTPException(422, "A remark (work purpose) is required for Outside Work and Work From Home")

    # ---- sequence validation
    if event_type == EventType.CHECK_IN.value:
        attendance_date = today
        if db.scalar(select(AttendanceEvent.id).where(
            AttendanceEvent.employee_id == emp.id, AttendanceEvent.attendance_date == today,
            AttendanceEvent.event_type == EventType.CHECK_IN.value,
        )):
            raise HTTPException(409, "You have already checked in today")
    else:
        last_in = db.scalar(
            select(AttendanceEvent)
            .where(AttendanceEvent.employee_id == emp.id, AttendanceEvent.event_type == EventType.CHECK_IN.value,
                   AttendanceEvent.attendance_date >= today - timedelta(days=1))
            .order_by(AttendanceEvent.occurred_at.desc()).limit(1)
        )
        if last_in is None:
            raise HTTPException(409, "No check-in found to check out of")
        if db.scalar(select(AttendanceEvent.id).where(
            AttendanceEvent.employee_id == emp.id, AttendanceEvent.attendance_date == last_in.attendance_date,
            AttendanceEvent.event_type == EventType.CHECK_OUT.value,
        )):
            raise HTTPException(409, "You have already checked out")
        if now - last_in.occurred_at > timedelta(hours=settings.max_shift_hours):
            raise HTTPException(409, "Your last check-in is too old to check out. Submit an attendance correction request.")
        attendance_date = last_in.attendance_date

    # ---- geofence (decided on the server, never trusted from the client)
    flags: list[str] = []
    gf_status = GeofenceStatus.NOT_APPLICABLE.value
    office = distance = radius = None
    if mode == AttendanceMode.OFFICE.value:
        stmt = select(Office).where(Office.is_active.is_(True))
        if office_id:
            stmt = stmt.where(Office.id == office_id)
        offices = list(db.scalars(stmt))
        if not offices:
            raise HTTPException(409, "No active office is configured. Ask the Owner to set up the office location.")
        res = geofence_service.evaluate_office(offices, latitude, longitude, accuracy_m, settings)
        gf_status, office, distance, radius, flags = res.status, res.office, res.distance_m, res.radius_m, res.flags
        if res.status == GeofenceStatus.OUTSIDE.value and settings.outside_radius_action == "BLOCK":
            raise HTTPException(
                422, f"You are {distance:.0f} m from {office.name}; Office attendance is allowed within {radius} m."
            )
    elif latitude is None:
        flags.append("NO_LOCATION")

    ext_key = storage_service.save_bytes("attendance", photo, photo_ext)
    ev = AttendanceEvent(
        employee_id=emp.id, attendance_date=attendance_date, event_type=event_type, mode=mode, occurred_at=now,
        latitude=latitude, longitude=longitude, accuracy_m=accuracy_m, office_id=office.id if office else None,
        distance_m=distance, radius_m=radius, geofence_status=gf_status, photo_key=ext_key, remark=remark,
        review_status=ReviewStatus.FLAGGED.value if flags else ReviewStatus.OK.value,
        flag_reasons=",".join(dict.fromkeys(flags)) or None, client_ip=ip,
    )
    db.add(ev)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        storage_service.delete_quietly(ext_key)
        raise HTTPException(409, "This attendance event was already recorded")
    audit_service.log(db, p.user, "ATTENDANCE_SUBMITTED", "attendance_event", ev.id,
                      {"type": event_type, "mode": mode, "geofence": gf_status, "flags": flags}, ip)
    if flags:
        targets = [emp.manager.user_id] if emp.manager else notification_service.user_ids_with_roles(db, (Role.HR, Role.OWNER))
        notification_service.notify_many(db, targets, "Attendance needs review",
                                         f"{emp.full_name}: {', '.join(flags)}", "/attendance/exceptions")
    return ev


def event_out(ev: AttendanceEvent, db: Session) -> dict:
    office = db.get(Office, ev.office_id) if ev.office_id else None
    return {
        "id": ev.id, "employee_id": ev.employee_id, "attendance_date": ev.attendance_date,
        "event_type": ev.event_type, "mode": ev.mode, "occurred_at": ev.occurred_at,
        "latitude": ev.latitude, "longitude": ev.longitude, "accuracy_m": ev.accuracy_m,
        "office_name": office.name if office else None, "distance_m": ev.distance_m, "radius_m": ev.radius_m,
        "geofence_status": ev.geofence_status, "remark": ev.remark, "review_status": ev.review_status,
        "flag_reasons": ev.flag_reasons.split(",") if ev.flag_reasons else [],
        "review_note": ev.review_note, "reviewed_at": ev.reviewed_at, "has_photo": True,
    }


# ------------------------------------------------------------ day computation
class _ShiftInfo:
    def __init__(self, start: time, grace: int, half: float, full: float, name: str):
        self.start, self.grace, self.half, self.full, self.name = start, grace, half, full, name


_FALLBACK = _ShiftInfo(time(9, 0), 0, 4.0, 8.0, "Default")


def _shift_info(s: Shift) -> _ShiftInfo:
    return _ShiftInfo(s.start_time, s.grace_minutes, float(s.half_day_hours), float(s.full_day_hours), s.name)


def shift_resolver(db: Session, employee_ids: list[int]):
    shifts = {s.id: s for s in db.scalars(select(Shift))}
    default = next((s for s in shifts.values() if s.is_default and s.is_active), None)
    assigns: dict[int, list[EmployeeShift]] = defaultdict(list)
    if employee_ids:
        for a in db.scalars(select(EmployeeShift).where(EmployeeShift.employee_id.in_(employee_ids))
                            .order_by(EmployeeShift.effective_from)):
            assigns[a.employee_id].append(a)

    def resolve(emp_id: int, d: date) -> _ShiftInfo:
        chosen = None
        for a in assigns.get(emp_id, []):
            if a.effective_from <= d and (a.effective_to is None or a.effective_to >= d):
                chosen = a
        s = shifts.get(chosen.shift_id) if chosen else default
        return _shift_info(s) if s else _FALLBACK

    return resolve


def build_rows(db: Session, employees: list[Employee], start: date, end: date) -> list[dict]:
    """One row per employee per date in [start, end] (never beyond today)."""
    settings = get_settings(db)
    tz = get_tz(settings)
    now = clock.now_utc()
    today = local_today(settings)
    end = min(end, today)
    if not employees or end < start:
        return []
    ids = [e.id for e in employees]

    events: dict[tuple[int, date], dict[str, AttendanceEvent]] = defaultdict(dict)
    for ev in db.scalars(select(AttendanceEvent).where(
        AttendanceEvent.employee_id.in_(ids), AttendanceEvent.attendance_date >= start, AttendanceEvent.attendance_date <= end
    )):
        events[(ev.employee_id, ev.attendance_date)][ev.event_type] = ev

    corrections: dict[tuple[int, date], AttendanceCorrection] = {}
    for c in db.scalars(select(AttendanceCorrection).where(
        AttendanceCorrection.employee_id.in_(ids), AttendanceCorrection.status == CorrectionStatus.APPROVED.value,
        AttendanceCorrection.attendance_date >= start, AttendanceCorrection.attendance_date <= end,
    ).order_by(AttendanceCorrection.id)):
        corrections[(c.employee_id, c.attendance_date)] = c

    leaves: dict[int, list[LeaveRequest]] = defaultdict(list)
    for lr in db.scalars(select(LeaveRequest).where(
        LeaveRequest.employee_id.in_(ids), LeaveRequest.status.in_(IN_FORCE_LEAVE_STATUSES),
        LeaveRequest.start_date <= end, LeaveRequest.end_date >= start,
    )):
        leaves[lr.employee_id].append(lr)

    holidays = {h.date: h.name for h in db.scalars(select(Holiday).where(Holiday.date >= start, Holiday.date <= end))}
    offs = weekly_off_set(settings)
    resolve_shift = shift_resolver(db, ids)

    rows: list[dict] = []
    for emp in employees:
        first = max(start, emp.joining_date)
        last = end
        if emp.deactivated_at:
            last = min(last, emp.deactivated_at.astimezone(tz).date())
        d = first
        while d <= last:
            rows.append(_compute_day(
                emp, d, today, now, tz, settings, events.get((emp.id, d), {}), corrections.get((emp.id, d)),
                leaves.get(emp.id, []), holidays.get(d), d.weekday() in offs, resolve_shift(emp.id, d),
            ))
            d += timedelta(days=1)
    return rows


def _compute_day(emp, d, today, now, tz, settings, evs, corr, leave_list, holiday_name, is_off, shift) -> dict:
    ev_in = evs.get(EventType.CHECK_IN.value)
    ev_out = evs.get(EventType.CHECK_OUT.value)
    ci = ev_in.occurred_at if ev_in else None
    co = ev_out.occurred_at if ev_out else None
    if corr:
        ci = corr.requested_check_in or ci
        co = corr.requested_check_out or co

    leave = next((lr for lr in leave_list if lr.start_date <= d <= lr.end_date), None)
    half_leave = bool(leave and leave.is_half_day)
    full_leave = bool(leave and not leave.is_half_day)

    worked_min = None
    if ci and co:
        worked_min = max(0, int((co - ci).total_seconds() // 60))

    if ci and not co:
        status = (DayStatus.CHECKED_IN if (now - ci) <= timedelta(hours=settings.max_shift_hours)
                  else DayStatus.INCOMPLETE).value
    elif ci and co:
        hours = worked_min / 60
        if hours >= shift.full:
            status = DayStatus.PRESENT.value
        elif hours >= shift.half:
            status = DayStatus.PRESENT.value if half_leave else DayStatus.HALF_DAY.value
        else:
            status = DayStatus.HALF_DAY.value if half_leave else DayStatus.ABSENT.value
    elif holiday_name:
        status = DayStatus.HOLIDAY.value
    elif is_off:
        status = DayStatus.WEEKLY_OFF.value
    elif full_leave:
        status = DayStatus.LEAVE.value
    elif half_leave:
        status = DayStatus.HALF_DAY.value
    elif d == today:
        status = DayStatus.NOT_MARKED.value
    else:
        status = DayStatus.ABSENT.value

    if corr and corr.requested_status:
        status = corr.requested_status

    late = False
    late_minutes = 0
    if ci:
        local_ci = ci.astimezone(tz)
        limit = datetime.combine(local_ci.date(), shift.start, tzinfo=tz) + timedelta(minutes=shift.grace)
        if local_ci > limit:
            late = True
            late_minutes = int((local_ci - limit).total_seconds() // 60)

    return {
        "employee_id": emp.id, "employee_code": emp.employee_code, "employee_name": emp.full_name,
        "department": emp.department, "date": d, "status": status, "check_in": ci, "check_out": co,
        "worked_minutes": worked_min, "mode": ev_in.mode if ev_in else (ev_out.mode if ev_out else None),
        "late": late, "late_minutes": late_minutes,
        "geofence_status": ev_in.geofence_status if ev_in else None,
        "review_status": ev_in.review_status if ev_in else None,
        "check_in_event_id": ev_in.id if ev_in else None, "check_out_event_id": ev_out.id if ev_out else None,
        "distance_m": ev_in.distance_m if ev_in else None,
        "leave_type": leave.leave_type.code if leave else None, "holiday": holiday_name,
        "corrected": bool(corr), "shift": shift.name,
    }


def summarize(rows: list[dict], settings=None) -> dict:
    counts = defaultdict(int)
    late = worked = 0
    for r in rows:
        counts[r["status"]] += 1
        late += 1 if r["late"] else 0
        worked += r["worked_minutes"] or 0
    out = {
        "days": len(rows), "present": counts["PRESENT"], "half_day": counts["HALF_DAY"], "absent": counts["ABSENT"],
        "leave": counts["LEAVE"], "holiday": counts["HOLIDAY"], "weekly_off": counts["WEEKLY_OFF"],
        "incomplete": counts["INCOMPLETE"], "checked_in": counts["CHECKED_IN"], "not_marked": counts["NOT_MARKED"],
        "late_count": late, "worked_minutes": worked,
        "payable_days": counts["PRESENT"] + 0.5 * counts["HALF_DAY"] + counts["LEAVE"] + counts["HOLIDAY"] + counts["WEEKLY_OFF"],
    }
    if settings is not None and settings.late_rule_enabled and settings.late_count_for_half_day > 0:
        out["late_half_day_deductions"] = (late // settings.late_count_for_half_day) * 0.5
    return out


# ---------------------------------------------------------------- corrections
def _to_utc(dt: datetime | None, tz) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(timezone.utc)


def create_correction(
    db: Session, p: Principal, employee: Employee, attendance_date: date, req_in: datetime | None,
    req_out: datetime | None, req_status: str | None, reason: str, ip: str | None,
) -> AttendanceCorrection:
    settings = get_settings(db)
    tz = get_tz(settings)
    today = local_today(settings)
    reason = reason.strip()
    if len(reason) < 5:
        raise HTTPException(422, "Please give a reason (at least 5 characters)")
    if not (req_in or req_out or req_status):
        raise HTTPException(422, "Provide a corrected check-in, check-out or status")
    if req_status and req_status not in (DayStatus.PRESENT.value, DayStatus.HALF_DAY.value, DayStatus.ABSENT.value):
        raise HTTPException(422, "Status must be PRESENT, HALF_DAY or ABSENT")
    if attendance_date > today:
        raise HTTPException(422, "Cannot correct a future date")
    if attendance_date < employee.joining_date:
        raise HTTPException(422, "Date is before the joining date")
    is_admin_direct = p.is_admin and employee.id != p.employee.id
    if not p.is_admin and (today - attendance_date).days > settings.correction_window_days:
        raise HTTPException(422, f"Corrections are allowed for the last {settings.correction_window_days} days only")

    req_in, req_out = _to_utc(req_in, tz), _to_utc(req_out, tz)
    if req_in and req_in.astimezone(tz).date() != attendance_date:
        raise HTTPException(422, "Corrected check-in must fall on the attendance date")
    if req_out and req_out.astimezone(tz).date() not in (attendance_date, attendance_date + timedelta(days=1)):
        raise HTTPException(422, "Corrected check-out must be on the attendance date or the next day")
    if req_in and req_out and req_out <= req_in:
        raise HTTPException(422, "Check-out must be after check-in")
    if req_in or req_out:
        # make sure the combination with the existing counterpart is consistent
        ev_in = db.scalar(select(AttendanceEvent).where(AttendanceEvent.employee_id == employee.id,
                          AttendanceEvent.attendance_date == attendance_date, AttendanceEvent.event_type == EventType.CHECK_IN.value))
        ev_out = db.scalar(select(AttendanceEvent).where(AttendanceEvent.employee_id == employee.id,
                           AttendanceEvent.attendance_date == attendance_date, AttendanceEvent.event_type == EventType.CHECK_OUT.value))
        eff_in = req_in or (ev_in.occurred_at if ev_in else None)
        eff_out = req_out or (ev_out.occurred_at if ev_out else None)
        if eff_in and eff_out and eff_out <= eff_in:
            raise HTTPException(422, "Corrected times would put check-out before check-in")

    if db.scalar(select(AttendanceCorrection.id).where(
        AttendanceCorrection.employee_id == employee.id, AttendanceCorrection.attendance_date == attendance_date,
        AttendanceCorrection.status == CorrectionStatus.PENDING.value,
    )):
        raise HTTPException(409, "A correction for this date is already pending")

    corr = AttendanceCorrection(
        employee_id=employee.id, attendance_date=attendance_date, requested_by=p.user.id,
        requested_check_in=req_in, requested_check_out=req_out, requested_status=req_status, reason=reason,
        status=CorrectionStatus.PENDING.value,
    )
    if is_admin_direct:
        corr.status = CorrectionStatus.APPROVED.value
        corr.is_direct = True
        corr.reviewer_id = p.user.id
        corr.decision_reason = "Entered directly by " + p.role
        corr.decided_at = clock.now_utc()
    db.add(corr)
    db.flush()
    audit_service.log(db, p.user, "ATTENDANCE_CORRECTED" if is_admin_direct else "ATTENDANCE_CORRECTION_REQUESTED",
                      "attendance_correction", corr.id, {"employee_id": employee.id, "date": attendance_date, "reason": reason}, ip)
    if is_admin_direct:
        notification_service.notify(db, employee.user_id, "Your attendance was corrected",
                                    f"{attendance_date}: {reason}", "/attendance")
    else:
        targets = [employee.manager.user_id] if employee.manager and settings.manager_can_review_corrections \
            else notification_service.user_ids_with_roles(db, (Role.HR, Role.OWNER))
        notification_service.notify_many(db, [t for t in targets if t != employee.user_id],
                                         "Attendance correction awaiting review",
                                         f"{employee.full_name}: {attendance_date}", "/attendance/corrections")
    return corr


def can_review_correction(db: Session, p: Principal, corr: AttendanceCorrection, emp: Employee) -> bool:
    if emp.id == p.employee.id:
        return False
    if p.is_admin:
        return True
    return bool(
        p.role == Role.REPORTING_MANAGER.value and emp.manager_id == p.employee.id
        and get_settings(db).manager_can_review_corrections
    )


def review_correction(db: Session, p: Principal, corr_id: int, decision: str, reason: str | None, ip: str | None):
    corr = db.scalar(select(AttendanceCorrection).where(AttendanceCorrection.id == corr_id).with_for_update())
    emp = db.get(Employee, corr.employee_id) if corr else None
    if corr is None or emp is None:
        raise HTTPException(404, "Correction not found")
    from app.core.permissions import can_view_employee
    if not can_view_employee(p, emp):
        raise HTTPException(404, "Correction not found")
    if not can_review_correction(db, p, corr, emp):
        raise HTTPException(403, "You are not allowed to review this correction")
    if corr.status != CorrectionStatus.PENDING.value:
        raise HTTPException(409, "This correction has already been decided")
    decision = decision.upper()
    if decision not in ("APPROVED", "REJECTED"):
        raise HTTPException(422, "Decision must be APPROVED or REJECTED")
    reason = (reason or "").strip() or None
    if decision == "REJECTED" and not reason:
        raise HTTPException(422, "Please give a reason when rejecting")
    corr.status = decision
    corr.reviewer_id = p.user.id
    corr.decision_reason = reason
    corr.decided_at = clock.now_utc()
    audit_service.log(db, p.user, f"ATTENDANCE_CORRECTION_{decision}", "attendance_correction", corr.id,
                      {"employee_id": emp.id, "date": corr.attendance_date}, ip)
    notification_service.notify(db, emp.user_id, f"Your attendance correction was {decision.lower()}",
                                reason, "/attendance")
    return corr


def correction_out(db: Session, c: AttendanceCorrection) -> dict:
    emp = db.get(Employee, c.employee_id)
    rev = db.get(Employee, db.scalar(select(Employee.id).where(Employee.user_id == c.reviewer_id))) if c.reviewer_id else None
    return {
        "id": c.id, "employee_id": c.employee_id, "employee_name": emp.full_name, "employee_code": emp.employee_code,
        "attendance_date": c.attendance_date, "requested_check_in": c.requested_check_in,
        "requested_check_out": c.requested_check_out, "requested_status": c.requested_status, "reason": c.reason,
        "status": c.status, "is_direct": c.is_direct, "reviewer_name": rev.full_name if rev else None,
        "decision_reason": c.decision_reason, "decided_at": c.decided_at, "created_at": c.created_at,
    }
