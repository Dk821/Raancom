from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_active_principal
from app.core.enums import CorrectionStatus, EmploymentStatus, ReviewStatus, Role
from app.core.permissions import Principal, team_clause
from app.db.session import get_db
from app.models.attendance import AttendanceEvent
from app.models.attendance_correction import AttendanceCorrection
from app.models.audit_log import AuditLog
from app.models.employee import Employee
from app.models.holiday import Holiday
from app.models.leave_request import LeaveRequest
from app.models.notification import Notification
from app.services import approval_service, attendance_service, leave_service
from app.services.settings_service import get_settings, local_today

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    s = get_settings(db)
    today = local_today(s)
    month_start = today.replace(day=1)
    out: dict = {"date": today, "role": p.role}

    # everyone is also an employee: own day, month and balances
    my_rows = attendance_service.build_rows(db, [p.employee], month_start, today)
    out["me"] = {
        "today": next((r for r in my_rows if r["date"] == today), None),
        "month": attendance_service.summarize(my_rows, s),
        "balances": leave_service.balance_summary(db, s, p.employee.id, today.year),
        "pending_requests": db.scalar(select(func.count(LeaveRequest.id)).where(
            LeaveRequest.employee_id == p.employee.id,
            LeaveRequest.status.in_(["PENDING_MANAGER", "PENDING_HR", "NEEDS_CHANGES", "CANCELLATION_REQUESTED"]))) or 0,
        "pending_corrections": db.scalar(select(func.count(AttendanceCorrection.id)).where(
            AttendanceCorrection.employee_id == p.employee.id,
            AttendanceCorrection.status == CorrectionStatus.PENDING.value)) or 0,
    }
    out["upcoming_holidays"] = [
        {"date": h.date, "name": h.name}
        for h in db.scalars(select(Holiday).where(Holiday.date >= today).order_by(Holiday.date).limit(5))
    ]

    if p.role == Role.EMPLOYEE.value:
        return out

    team = list(db.scalars(select(Employee).where(team_clause(p), Employee.status == EmploymentStatus.ACTIVE.value)))
    today_rows = attendance_service.build_rows(db, team, today, today)
    counts = attendance_service.summarize(today_rows, s)
    month_rows = attendance_service.build_rows(db, team, month_start, today)
    ids = [e.id for e in team] or [-1]

    out["team"] = {
        "headcount": len(team),
        "today": {k: counts[k] for k in ("present", "half_day", "absent", "leave", "checked_in", "not_marked",
                                         "incomplete", "holiday", "weekly_off")},
        "pending_leave_approvals": db.scalar(
            select(func.count(LeaveRequest.id)).join(Employee, Employee.id == LeaveRequest.employee_id)
            .where(approval_service.pending_for_me_clause(p))) or 0,
        "pending_corrections": 0 if (p.role == Role.REPORTING_MANAGER.value and not s.manager_can_review_corrections)
        else (db.scalar(select(func.count(AttendanceCorrection.id)).where(
            AttendanceCorrection.employee_id.in_(ids), AttendanceCorrection.employee_id != p.employee.id,
            AttendanceCorrection.status == CorrectionStatus.PENDING.value)) or 0),
        "flagged_events": db.scalar(select(func.count(AttendanceEvent.id)).where(
            AttendanceEvent.employee_id.in_(ids), AttendanceEvent.review_status == ReviewStatus.FLAGGED.value)) or 0,
        "late_this_month": [r for r in month_rows if r["late"]][-10:],
        "absent_today": [r for r in today_rows if r["status"] == "ABSENT"],
        "incomplete_recent": [r for r in month_rows if r["status"] == "INCOMPLETE"][-10:],
    }
    if p.is_admin:
        total = db.scalar(select(func.count(Employee.id)))
        out["team"]["headcount_total"] = total
        out["team"]["inactive"] = db.scalar(
            select(func.count(Employee.id)).where(Employee.status == EmploymentStatus.INACTIVE.value))
        out["team"]["on_leave_today"] = counts["leave"]
    if p.role == Role.OWNER.value:
        out["recent_audit"] = [
            {"id": a.id, "action": a.action, "entity_type": a.entity_type, "created_at": a.created_at}
            for a in db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(8))
        ]
    return out


# ------------------------------------------------------------- notifications
@router.get("/notifications")
def notifications(unread_only: bool = False, p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    stmt = select(Notification).where(Notification.user_id == p.user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    rows = db.scalars(stmt.order_by(Notification.id.desc()).limit(50))
    unread = db.scalar(select(func.count(Notification.id)).where(
        Notification.user_id == p.user.id, Notification.is_read.is_(False))) or 0
    return {"unread": unread, "items": [
        {"id": n.id, "title": n.title, "body": n.body, "link": n.link, "is_read": n.is_read, "created_at": n.created_at}
        for n in rows]}


@router.post("/notifications/read-all")
def read_all(p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == p.user.id).values(is_read=True))
    db.commit()
    return {"message": "ok"}


@router.post("/notifications/{notification_id}/read")
def read_one(notification_id: int, p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != p.user.id:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    return {"message": "ok"}
