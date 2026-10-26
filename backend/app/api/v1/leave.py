from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_active_principal, require_roles
from app.core.enums import ACTIVE_LEAVE_STATUSES, IN_FORCE_LEAVE_STATUSES, EmploymentStatus, LedgerType, Role
from app.core.permissions import Principal, employee_for_view, scope_clause, team_clause
from app.db.session import get_db
from app.models.employee import Employee
from app.models.holiday import Holiday
from app.models.leave_ledger import LeaveLedger
from app.models.leave_request import LeaveRequest
from app.models.leave_type import LeaveType
from app.services import approval_service as appr
from app.services import audit_service, leave_service, notification_service, storage_service
from app.services.settings_service import get_settings, local_today

router = APIRouter(prefix="/leave", tags=["leave"])


def _type_or_422(db: Session, type_id: int) -> LeaveType:
    lt = db.get(LeaveType, type_id)
    if lt is None:
        raise HTTPException(422, "Unknown leave type")
    return lt


def request_out(db: Session, p: Principal, r: LeaveRequest, detail: bool = False) -> dict:
    emp = r.employee
    step = appr.decider_step(p, r)
    mine = r.employee_id == p.employee.id
    out = {
        "id": r.id,
        "employee": {"id": emp.id, "employee_code": emp.employee_code, "full_name": emp.full_name,
                     "department": emp.department},
        "leave_type": {"id": r.leave_type.id, "code": r.leave_type.code, "name": r.leave_type.name},
        "start_date": r.start_date, "end_date": r.end_date, "is_half_day": r.is_half_day,
        "half_day_session": r.half_day_session, "days": r.days, "reason": r.reason,
        "has_attachment": bool(r.attachment_key), "status": r.status, "created_at": r.created_at,
        "decided_at": r.decided_at,
        "can_decide": step is not None,
        "can_edit": mine and r.status in ("PENDING_MANAGER", "PENDING_HR", "NEEDS_CHANGES"),
        "can_cancel": (mine and r.status in ("PENDING_MANAGER", "PENDING_HR", "NEEDS_CHANGES", "APPROVED"))
        or (not mine and p.role in (Role.HR.value, Role.OWNER.value) and r.status == "APPROVED"),
    }
    if detail:
        out["history"] = [
            {"id": a.id, "step": a.step, "action": a.action, "comments": a.comments, "created_at": a.created_at,
             "actor_name": a.actor.employee.full_name if a.actor and a.actor.employee else None}
            for a in r.approvals
        ]
    return out


# -------------------------------------------------------------- reference data
@router.get("/types")
def leave_types(include_inactive: bool = False, p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    stmt = select(LeaveType).order_by(LeaveType.id)
    if not (include_inactive and p.is_admin):
        stmt = stmt.where(LeaveType.is_active.is_(True))
    return [
        {"id": t.id, "code": t.code, "name": t.name, "is_paid": t.is_paid, "allows_half_day": t.allows_half_day,
         "balance_required": t.balance_required, "requires_attachment": t.requires_attachment,
         "annual_entitlement": t.annual_entitlement, "carry_forward_max": t.carry_forward_max, "is_active": t.is_active}
        for t in db.scalars(stmt)
    ]


# ------------------------------------------------------------------ requests
class EstimateBody(BaseModel):
    leave_type_id: int
    start_date: date
    end_date: date
    is_half_day: bool = False
    half_day_session: Optional[str] = None
    exclude_request_id: Optional[int] = None


@router.post("/estimate")
def estimate(body: EstimateBody, p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    """Days that would be charged and the balance, shown before the employee submits."""
    settings = get_settings(db)
    lt = _type_or_422(db, body.leave_type_id)
    try:
        chk = leave_service.validate_request(db, settings, p.employee, lt, body.start_date, body.end_date,
                                             body.is_half_day, body.half_day_session, body.exclude_request_id)
    except HTTPException as e:
        if e.status_code in (409, 422):
            return {"ok": False, "error": e.detail}
        raise
    return {"ok": True, "days": chk.days, "by_year": chk.by_year, "available": chk.available, "warnings": chk.warnings}


@router.post("/requests", status_code=201)
def create_request(
    request: Request,
    leave_type_id: int = Form(...),
    start_date: date = Form(...),
    end_date: date = Form(...),
    reason: str = Form(..., min_length=3, max_length=2000),
    is_half_day: bool = Form(False),
    half_day_session: Optional[str] = Form(None),
    attachment: Optional[UploadFile] = File(None),
    p: Principal = Depends(get_active_principal),
    db: Session = Depends(get_db),
):
    lt = _type_or_422(db, leave_type_id)
    key = None
    if attachment is not None and attachment.filename:
        data, ext = storage_service.read_validated(attachment, {"pdf", "jpg", "png", "webp"})
        key = storage_service.save_bytes("leave", data, ext)
    try:
        req = appr.submit(db, p, lt, start_date, end_date, is_half_day, half_day_session, reason, key)
        db.commit()
    except Exception:
        db.rollback()
        storage_service.delete_quietly(key)
        raise
    return request_out(db, p, req, detail=True)


@router.get("/requests")
def list_requests(
    scope: str = Query("mine", pattern="^(mine|team|pending)$"),
    status: Optional[str] = None, employee_id: Optional[int] = None, leave_type_id: Optional[int] = None,
    from_date: Optional[date] = Query(None, alias="from"), to_date: Optional[date] = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    p: Principal = Depends(get_active_principal), db: Session = Depends(get_db),
):
    stmt = select(LeaveRequest).join(Employee, Employee.id == LeaveRequest.employee_id)
    if scope == "mine":
        stmt = stmt.where(LeaveRequest.employee_id == p.employee.id)
    elif p.role == Role.EMPLOYEE.value:
        raise HTTPException(403, "You do not have permission to view team requests")
    elif scope == "team":
        stmt = stmt.where(team_clause(p))
    else:
        stmt = stmt.where(appr.pending_for_me_clause(p))
    if status:
        stmt = stmt.where(LeaveRequest.status == status)
    if employee_id:
        stmt = stmt.where(LeaveRequest.employee_id == employee_id)
    if leave_type_id:
        stmt = stmt.where(LeaveRequest.leave_type_id == leave_type_id)
    if from_date:
        stmt = stmt.where(LeaveRequest.end_date >= from_date)
    if to_date:
        stmt = stmt.where(LeaveRequest.start_date <= to_date)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(LeaveRequest.id.desc()).limit(limit).offset(offset))
    return {"items": [request_out(db, p, r) for r in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/requests/{request_id}")
def get_request(request_id: int, p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    return request_out(db, p, appr.load_for_view(db, p, request_id), detail=True)


class EditBody(BaseModel):
    leave_type_id: int
    start_date: date
    end_date: date
    reason: str
    is_half_day: bool = False
    half_day_session: Optional[str] = None


@router.patch("/requests/{request_id}")
def edit_request(request_id: int, body: EditBody, p: Principal = Depends(get_active_principal),
                 db: Session = Depends(get_db)):
    req = appr.load_for_view(db, p, request_id, lock=True)
    lt = _type_or_422(db, body.leave_type_id)
    appr.edit(db, p, req, lt, body.start_date, body.end_date, body.is_half_day, body.half_day_session, body.reason)
    db.commit()
    return request_out(db, p, req, detail=True)


@router.post("/requests/{request_id}/attachment")
def replace_attachment(request_id: int, attachment: UploadFile = File(...), p: Principal = Depends(get_active_principal),
                       db: Session = Depends(get_db)):
    req = appr.load_for_view(db, p, request_id, lock=True)
    if req.employee_id != p.employee.id:
        raise HTTPException(403, "Only the requester can attach documents")
    if req.status not in ("PENDING_MANAGER", "PENDING_HR", "NEEDS_CHANGES"):
        raise HTTPException(409, "Documents can only be changed on pending requests")
    data, ext = storage_service.read_validated(attachment, {"pdf", "jpg", "png", "webp"})
    old, req.attachment_key = req.attachment_key, storage_service.save_bytes("leave", data, ext)
    audit_service.log(db, p.user, "LEAVE_ATTACHMENT_CHANGED", "leave_request", req.id)
    db.commit()
    storage_service.delete_quietly(old)
    return request_out(db, p, req, detail=True)


@router.get("/requests/{request_id}/attachment")
def get_attachment(request_id: int, p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    req = appr.load_for_view(db, p, request_id)
    if not req.attachment_key:
        raise HTTPException(404, "No attachment")
    return FileResponse(storage_service.resolve(req.attachment_key),
                        media_type=storage_service.media_type_for(req.attachment_key),
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


class DecisionBody(BaseModel):
    decision: str
    comments: Optional[str] = None


@router.post("/requests/{request_id}/decisions")
def decide(request_id: int, body: DecisionBody, p: Principal = Depends(get_active_principal),
           db: Session = Depends(get_db)):
    req = appr.decide(db, p, request_id, body.decision, body.comments)
    db.commit()
    return request_out(db, p, req, detail=True)


class CancelBody(BaseModel):
    reason: Optional[str] = None


@router.post("/requests/{request_id}/cancel")
def cancel(request_id: int, body: CancelBody, p: Principal = Depends(get_active_principal),
           db: Session = Depends(get_db)):
    req = appr.cancel(db, p, request_id, body.reason)
    db.commit()
    return request_out(db, p, req, detail=True)


# ------------------------------------------------------------------ balances
@router.get("/balances/me")
def my_balances(year: Optional[int] = None, p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    s = get_settings(db)
    y = year or local_today(s).year
    return {"year": y, "balances": leave_service.balance_summary(db, s, p.employee.id, y)}


@router.get("/balances/{employee_id}")
def employee_balances(employee_id: int, year: Optional[int] = None, p: Principal = Depends(get_active_principal),
                      db: Session = Depends(get_db)):
    emp = employee_for_view(db, p, employee_id)
    s = get_settings(db)
    y = year or local_today(s).year
    return {"year": y, "employee_id": emp.id, "balances": leave_service.balance_summary(db, s, emp.id, y)}


@router.get("/ledger/{employee_id}")
def ledger(employee_id: int, year: Optional[int] = None, p: Principal = Depends(get_active_principal),
           db: Session = Depends(get_db)):
    emp = employee_for_view(db, p, employee_id)
    y = year or local_today(get_settings(db)).year
    rows = db.scalars(select(LeaveLedger).where(LeaveLedger.employee_id == emp.id, LeaveLedger.year == y)
                      .order_by(LeaveLedger.id.desc()).limit(500))
    types = {t.id: t.code for t in db.scalars(select(LeaveType))}
    return [{"id": l.id, "leave_type": types.get(l.leave_type_id), "year": l.year, "txn_type": l.txn_type,
             "days": l.days, "reference_type": l.reference_type, "reference_id": l.reference_id, "note": l.note,
             "created_at": l.created_at} for l in rows]


class AdjustBody(BaseModel):
    employee_id: int
    leave_type_id: int
    days: float
    year: Optional[int] = None
    note: str


@router.post("/adjustments", status_code=201)
def adjust(body: AdjustBody, request: Request, p: Principal = Depends(require_roles(Role.OWNER, Role.HR)),
           db: Session = Depends(get_db)):
    emp = db.get(Employee, body.employee_id)
    lt = db.get(LeaveType, body.leave_type_id)
    if emp is None or lt is None:
        raise HTTPException(404, "Employee or leave type not found")
    if emp.id == p.employee.id:
        raise HTTPException(403, "You cannot adjust your own leave balance")
    if body.days == 0 or abs(body.days) > 365 or round(body.days * 2) != body.days * 2:
        raise HTTPException(422, "Adjustment must be a non-zero multiple of 0.5")
    if not lt.balance_required:
        raise HTTPException(422, "This leave type has no balance")
    if len(body.note.strip()) < 3:
        raise HTTPException(422, "A note is required for adjustments")
    year = body.year or local_today(get_settings(db)).year
    bal = leave_service.post_ledger(db, emp.id, lt.id, year, LedgerType.ADJUSTMENT, body.days,
                                    note=body.note.strip(), actor_user_id=p.user.id)
    audit_service.log(db, p.user, "LEAVE_BALANCE_ADJUSTED", "employee", emp.id,
                      {"type": lt.code, "days": body.days, "year": year, "note": body.note}, client_ip(request))
    notification_service.notify(db, emp.user_id, "Your leave balance was adjusted",
                                f"{lt.code}: {body.days:+g} day(s). {body.note}", "/leave")
    db.commit()
    return {"balance": bal.balance}


class RolloverBody(BaseModel):
    year: int


@router.post("/rollover")
def rollover(body: RolloverBody, request: Request, p: Principal = Depends(require_roles(Role.OWNER)),
             db: Session = Depends(get_db)):
    """Carry forward (capped per leave type) and allocate entitlements for a new leave year. Idempotent."""
    if not 2000 <= body.year <= 2100:
        raise HTTPException(422, "Invalid year")
    result = leave_service.roll_over_year(db, body.year, p.user.id)
    audit_service.log(db, p.user, "LEAVE_YEAR_ROLLOVER", "company", None, result, client_ip(request))
    db.commit()
    return result


# ------------------------------------------------------------------ calendar
@router.get("/calendar")
def calendar(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"), p: Principal = Depends(get_active_principal),
             db: Session = Depends(get_db)):
    y, m = int(month[:4]), int(month[5:7])
    if not 1 <= m <= 12:
        raise HTTPException(422, "Invalid month")
    first = date(y, m, 1)
    last = date(y + (m == 12), (m % 12) + 1, 1)
    from datetime import timedelta
    last = last - timedelta(days=1)
    stmt = (select(LeaveRequest).join(Employee, Employee.id == LeaveRequest.employee_id)
            .where(scope_clause(p), LeaveRequest.status.in_(ACTIVE_LEAVE_STATUSES),
                   LeaveRequest.start_date <= last, LeaveRequest.end_date >= first))
    leaves = [
        {"id": r.id, "employee_id": r.employee_id, "employee_name": r.employee.full_name,
         "leave_type": r.leave_type.code, "start_date": r.start_date, "end_date": r.end_date,
         "is_half_day": r.is_half_day, "status": r.status, "approved": r.status in IN_FORCE_LEAVE_STATUSES}
        for r in db.scalars(stmt)
    ]
    holidays = [{"date": h.date, "name": h.name, "holiday_type": h.holiday_type}
                for h in db.scalars(select(Holiday).where(Holiday.date >= first, Holiday.date <= last).order_by(Holiday.date))]
    return {"month": month, "leaves": leaves, "holidays": holidays}
