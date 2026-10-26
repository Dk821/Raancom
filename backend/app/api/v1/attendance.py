from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_active_principal, require_roles
from app.core.enums import (
    AttendanceMode,
    CorrectionStatus,
    EmploymentStatus,
    EventType,
    ReviewStatus,
    Role,
)
from app.core.permissions import Principal, can_view_employee, employee_for_view, team_clause
from app.db.session import get_db
from app.models.attendance import AttendanceEvent
from app.models.attendance_correction import AttendanceCorrection
from app.models.employee import Employee
from app.models.office import Office
from app.services import attendance_service as svc
from app.services import audit_service, report_service, storage_service
from app.services.settings_service import get_settings, local_today, to_local
from app.core import clock

router = APIRouter(prefix="/attendance", tags=["attendance"])
reviewer = require_roles(Role.OWNER, Role.HR, Role.REPORTING_MANAGER)


# ----------------------------------------------------------------- employee
@router.post("/events", status_code=201)
def submit_event(
    request: Request,
    event_type: EventType = Form(...),
    mode: AttendanceMode = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    accuracy_m: Optional[float] = Form(None),
    remark: Optional[str] = Form(None),
    office_id: Optional[int] = Form(None),
    photo: UploadFile = File(...),
    p: Principal = Depends(get_active_principal),
    db: Session = Depends(get_db),
):
    data, ext = storage_service.read_validated(photo, {"jpg", "png", "webp"})
    ev = svc.submit_event(db, p, event_type.value, mode.value, latitude, longitude, accuracy_m, remark, office_id,
                          data, ext, client_ip(request))
    db.commit()
    return {"event": svc.event_out(ev, db)}


@router.get("/today")
def today_state(p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    settings = get_settings(db)
    now = clock.now_utc()
    today = local_today(settings)
    last_in = db.scalar(
        select(AttendanceEvent)
        .where(AttendanceEvent.employee_id == p.employee.id, AttendanceEvent.event_type == EventType.CHECK_IN.value,
               AttendanceEvent.attendance_date >= today - timedelta(days=1))
        .order_by(AttendanceEvent.occurred_at.desc()).limit(1)
    )
    ev_out = None
    state = "NOT_STARTED"
    if last_in:
        ev_out = db.scalar(select(AttendanceEvent).where(
            AttendanceEvent.employee_id == p.employee.id, AttendanceEvent.attendance_date == last_in.attendance_date,
            AttendanceEvent.event_type == EventType.CHECK_OUT.value))
        is_today = last_in.attendance_date == today
        if ev_out:
            state = "COMPLETED" if is_today else "NOT_STARTED"
        elif now - last_in.occurred_at <= timedelta(hours=settings.max_shift_hours):
            state = "CHECKED_IN"
        else:
            state = "STALE" if is_today else "NOT_STARTED"  # stale: fix through a correction request
        if state == "NOT_STARTED":
            last_in = ev_out = None  # yesterday's finished/stale shift is not today's state
    rows = svc.build_rows(db, [p.employee], today, today)
    offices = [{"id": o.id, "name": o.name, "radius_m": o.radius_m}
               for o in db.scalars(select(Office).where(Office.is_active.is_(True)))]
    return {
        "date": today, "state": state, "can_check_in": state == "NOT_STARTED",
        "can_check_out": state == "CHECKED_IN",
        "check_in": svc.event_out(last_in, db) if last_in else None,
        "check_out": svc.event_out(ev_out, db) if ev_out else None,
        "day": rows[0] if rows else None, "offices": offices,
        "max_gps_accuracy_m": settings.max_gps_accuracy_m,
    }


def _range(settings, frm: Optional[date], to: Optional[date]):
    return report_service.parse_range(frm, to, settings)


@router.get("/me")
def my_attendance(from_date: Optional[date] = Query(None, alias="from"), to_date: Optional[date] = Query(None, alias="to"),
                  p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    settings = get_settings(db)
    frm, to = _range(settings, from_date, to_date)
    rows = svc.build_rows(db, [p.employee], frm, to)
    return {"from": frm, "to": to, "rows": sorted(rows, key=lambda r: r["date"], reverse=True),
            "summary": svc.summarize(rows, settings)}


# ---------------------------------------------------------- team / admin views
@router.get("")
def register(
    from_date: Optional[date] = Query(None, alias="from"), to_date: Optional[date] = Query(None, alias="to"),
    employee_id: Optional[int] = None, department: Optional[str] = None, manager_id: Optional[int] = None,
    mode: Optional[AttendanceMode] = None, status: Optional[str] = None,
    p: Principal = Depends(reviewer), db: Session = Depends(get_db),
):
    settings = get_settings(db)
    frm, to = _range(settings, from_date, to_date)
    emps = report_service.scoped_employees(
        db, p, {"employee_id": employee_id, "department": department, "manager_id": manager_id})
    rows = svc.build_rows(db, emps, frm, to)
    if mode:
        rows = [r for r in rows if r["mode"] == mode.value]
    if status:
        rows = [r for r in rows if r["status"] == status]
    rows.sort(key=lambda r: (r["date"], r["employee_name"]), reverse=True)
    return {"from": frm, "to": to, "rows": rows[:5000], "total": len(rows), "summary": svc.summarize(rows, settings)}


@router.get("/exceptions")
def exceptions(p: Principal = Depends(reviewer), db: Session = Depends(get_db)):
    settings = get_settings(db)
    today = local_today(settings)
    stmt = (select(AttendanceEvent, Employee).join(Employee, Employee.id == AttendanceEvent.employee_id)
            .where(team_clause(p), AttendanceEvent.review_status == ReviewStatus.FLAGGED.value)
            .order_by(AttendanceEvent.occurred_at.desc()).limit(200))
    flagged = []
    for ev, emp in db.execute(stmt):
        d = svc.event_out(ev, db)
        d.update(employee_name=emp.full_name, employee_code=emp.employee_code)
        flagged.append(d)
    emps = list(db.scalars(select(Employee).where(team_clause(p), Employee.status == EmploymentStatus.ACTIVE.value)))
    incomplete = [r for r in svc.build_rows(db, emps, today - timedelta(days=30), today) if r["status"] == "INCOMPLETE"]
    incomplete.sort(key=lambda r: r["date"], reverse=True)
    return {"flagged": flagged, "incomplete": incomplete}


class ReviewBody(BaseModel):
    note: Optional[str] = None


def _event_for_view(db: Session, p: Principal, event_id: int) -> tuple[AttendanceEvent, Employee]:
    ev = db.get(AttendanceEvent, event_id)
    emp = db.get(Employee, ev.employee_id) if ev else None
    if ev is None or emp is None or not can_view_employee(p, emp):
        raise HTTPException(404, "Attendance record not found")
    return ev, emp


@router.post("/events/{event_id}/review")
def review_event(event_id: int, body: ReviewBody, request: Request, p: Principal = Depends(reviewer),
                 db: Session = Depends(get_db)):
    ev, emp = _event_for_view(db, p, event_id)
    if emp.id == p.employee.id:
        raise HTTPException(403, "You cannot review your own attendance")
    if ev.review_status == ReviewStatus.OK.value:
        raise HTTPException(409, "This record has no exception to review")
    ev.review_status = ReviewStatus.REVIEWED.value
    ev.reviewed_by = p.user.id
    ev.reviewed_at = clock.now_utc()
    ev.review_note = (body.note or "").strip() or None
    audit_service.log(db, p.user, "ATTENDANCE_EXCEPTION_REVIEWED", "attendance_event", ev.id,
                      {"employee_id": emp.id, "note": ev.review_note}, client_ip(request))
    db.commit()
    return svc.event_out(ev, db)


@router.get("/events/{event_id}/photo")
def event_photo(event_id: int, p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    ev, _ = _event_for_view(db, p, event_id)
    path = storage_service.resolve(ev.photo_key)
    return FileResponse(path, media_type=storage_service.media_type_for(ev.photo_key),
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/events")
def my_events(attendance_date: date, employee_id: Optional[int] = None, p: Principal = Depends(get_active_principal),
              db: Session = Depends(get_db)):
    emp = employee_for_view(db, p, employee_id or p.employee.id)
    evs = db.scalars(select(AttendanceEvent).where(
        AttendanceEvent.employee_id == emp.id, AttendanceEvent.attendance_date == attendance_date
    ).order_by(AttendanceEvent.occurred_at))
    return [svc.event_out(e, db) for e in evs]


# --------------------------------------------------------------- corrections
class CorrectionCreate(BaseModel):
    attendance_date: date
    requested_check_in: Optional[datetime] = None
    requested_check_out: Optional[datetime] = None
    requested_status: Optional[str] = None
    reason: str
    employee_id: Optional[int] = None  # HR/Owner only: correct someone else's record directly


@router.post("/corrections", status_code=201)
def create_correction(body: CorrectionCreate, request: Request, p: Principal = Depends(get_active_principal),
                      db: Session = Depends(get_db)):
    if body.employee_id and body.employee_id != p.employee.id:
        if not p.is_admin:
            raise HTTPException(403, "Only HR or the Owner can correct another employee's attendance")
        emp = db.get(Employee, body.employee_id)
        if emp is None:
            raise HTTPException(404, "Employee not found")
    else:
        emp = p.employee
    corr = svc.create_correction(db, p, emp, body.attendance_date, body.requested_check_in, body.requested_check_out,
                                 body.requested_status, body.reason, client_ip(request))
    db.commit()
    return svc.correction_out(db, corr)


@router.get("/corrections")
def list_corrections(scope: str = Query("mine", pattern="^(mine|team|pending)$"), status: Optional[str] = None,
                     limit: int = Query(100, ge=1, le=300), p: Principal = Depends(get_active_principal),
                     db: Session = Depends(get_db)):
    stmt = select(AttendanceCorrection).join(Employee, Employee.id == AttendanceCorrection.employee_id)
    if scope == "mine":
        stmt = stmt.where(AttendanceCorrection.employee_id == p.employee.id)
    else:
        if p.role == Role.EMPLOYEE.value:
            raise HTTPException(403, "You do not have permission to view team corrections")
        stmt = stmt.where(team_clause(p), AttendanceCorrection.employee_id != p.employee.id)
        if p.role == Role.REPORTING_MANAGER.value and not get_settings(db).manager_can_review_corrections:
            raise HTTPException(403, "Managers are not configured to review corrections")
        if scope == "pending":
            stmt = stmt.where(AttendanceCorrection.status == CorrectionStatus.PENDING.value)
    if status:
        stmt = stmt.where(AttendanceCorrection.status == status)
    rows = db.scalars(stmt.order_by(AttendanceCorrection.id.desc()).limit(limit))
    return [svc.correction_out(db, c) for c in rows]


class CorrectionReview(BaseModel):
    decision: str
    reason: Optional[str] = None


@router.post("/corrections/{correction_id}/review")
def review_correction(correction_id: int, body: CorrectionReview, request: Request,
                      p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    corr = svc.review_correction(db, p, correction_id, body.decision, body.reason, client_ip(request))
    db.commit()
    return svc.correction_out(db, corr)
