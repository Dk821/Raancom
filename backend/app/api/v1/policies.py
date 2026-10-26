from datetime import date, time
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_active_principal, require_leave_policy_editor, require_roles
from app.core.enums import HolidayType, Role
from app.core.permissions import Principal
from app.db.session import get_db
from app.models.employee import Employee
from app.models.holiday import Holiday
from app.models.leave_type import LeaveType
from app.models.office import Office
from app.models.shift import EmployeeShift, Shift
from app.services import audit_service
from app.services.settings_service import WEEKDAY_CODES, get_settings

router = APIRouter(prefix="/policies", tags=["policies"])
owner_only = require_roles(Role.OWNER)
owner_or_hr = require_roles(Role.OWNER, Role.HR)

SETTING_FIELDS = [
    "company_name", "timezone", "weekly_offs", "outside_radius_action", "max_gps_accuracy_m", "max_shift_hours",
    "correction_window_days", "manager_can_review_corrections", "late_rule_enabled", "late_count_for_half_day",
    "photo_retention_days", "hr_second_level_leave", "weekends_count_as_leave", "holidays_count_as_leave",
    "allow_backdated_leave", "backdated_max_days", "insufficient_balance_action",
    "approved_leave_cancel_needs_approval", "hr_can_manage_managers", "hr_can_edit_leave_policy",
]


def _settings_out(s) -> dict:
    return {f: getattr(s, f) for f in SETTING_FIELDS}


@router.get("/public")
def public_settings(p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    """Non-sensitive values every signed-in user needs to render the UI correctly."""
    s = get_settings(db)
    return {"company_name": s.company_name, "timezone": s.timezone, "weekly_offs": s.weekly_offs.split(","),
            "max_gps_accuracy_m": s.max_gps_accuracy_m, "late_rule_enabled": s.late_rule_enabled,
            "hr_second_level_leave": s.hr_second_level_leave,
            "approved_leave_cancel_needs_approval": s.approved_leave_cancel_needs_approval}


@router.get("/settings")
def get_company_settings(p: Principal = Depends(owner_or_hr), db: Session = Depends(get_db)):
    return _settings_out(get_settings(db))


class SettingsUpdate(BaseModel):
    company_name: Optional[str] = Field(None, min_length=1, max_length=150)
    timezone: Optional[str] = None
    weekly_offs: Optional[str] = None
    outside_radius_action: Optional[str] = None
    max_gps_accuracy_m: Optional[int] = Field(None, ge=5, le=5000)
    max_shift_hours: Optional[int] = Field(None, ge=4, le=24)
    correction_window_days: Optional[int] = Field(None, ge=1, le=365)
    manager_can_review_corrections: Optional[bool] = None
    late_rule_enabled: Optional[bool] = None
    late_count_for_half_day: Optional[int] = Field(None, ge=1, le=31)
    photo_retention_days: Optional[int] = Field(None, ge=1, le=3650)
    hr_second_level_leave: Optional[bool] = None
    weekends_count_as_leave: Optional[bool] = None
    holidays_count_as_leave: Optional[bool] = None
    allow_backdated_leave: Optional[bool] = None
    backdated_max_days: Optional[int] = Field(None, ge=0, le=365)
    insufficient_balance_action: Optional[str] = None
    approved_leave_cancel_needs_approval: Optional[bool] = None
    hr_can_manage_managers: Optional[bool] = None
    hr_can_edit_leave_policy: Optional[bool] = None

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v):
        if v is not None:
            try:
                ZoneInfo(v)
            except Exception:
                raise ValueError("Unknown timezone")
        return v

    @field_validator("weekly_offs")
    @classmethod
    def _offs(cls, v):
        if v is None:
            return v
        codes = [c.strip().upper() for c in v.split(",") if c.strip()]
        if any(c not in WEEKDAY_CODES for c in codes):
            raise ValueError("weekly_offs must be a comma list of MON..SUN")
        return ",".join(codes)

    @field_validator("outside_radius_action")
    @classmethod
    def _act(cls, v):
        if v is not None and v not in ("FLAG", "BLOCK"):
            raise ValueError("Must be FLAG or BLOCK")
        return v

    @field_validator("insufficient_balance_action")
    @classmethod
    def _bal(cls, v):
        if v is not None and v not in ("BLOCK", "ALLOW"):
            raise ValueError("Must be BLOCK or ALLOW")
        return v


@router.put("/settings")
def update_settings(body: SettingsUpdate, request: Request, p: Principal = Depends(owner_only),
                    db: Session = Depends(get_db)):
    s = get_settings(db)
    changes = {}
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None and k != "photo_retention_days":
            continue  # only the retention period may be cleared
        if getattr(s, k) != v:
            changes[k] = {"from": getattr(s, k), "to": v}
            setattr(s, k, v)
    s.updated_by = p.user.id
    if changes:
        audit_service.log(db, p.user, "POLICY_SETTINGS_UPDATED", "company_setting", 1, changes, client_ip(request))
    db.commit()
    return _settings_out(s)


# --------------------------------------------------------------- leave types
class LeaveTypeIn(BaseModel):
    code: str = Field(min_length=1, max_length=16)
    name: str = Field(min_length=1, max_length=100)
    is_paid: bool = True
    allows_half_day: bool = True
    balance_required: bool = True
    annual_entitlement: float = Field(0, ge=0, le=366)
    carry_forward_max: float = Field(0, ge=0, le=366)
    requires_attachment: bool = False
    is_active: bool = True


class LeaveTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    is_paid: Optional[bool] = None
    allows_half_day: Optional[bool] = None
    balance_required: Optional[bool] = None
    annual_entitlement: Optional[float] = Field(None, ge=0, le=366)
    carry_forward_max: Optional[float] = Field(None, ge=0, le=366)
    requires_attachment: Optional[bool] = None
    is_active: Optional[bool] = None


@router.post("/leave-types", status_code=201)
def create_leave_type(body: LeaveTypeIn, request: Request, p: Principal = Depends(require_leave_policy_editor),
                      db: Session = Depends(get_db)):
    code = body.code.strip().upper()
    if db.scalar(select(LeaveType.id).where(LeaveType.code == code)):
        raise HTTPException(409, "A leave type with this code already exists")
    lt = LeaveType(**{**body.model_dump(), "code": code})
    db.add(lt)
    db.flush()
    audit_service.log(db, p.user, "LEAVE_TYPE_CREATED", "leave_type", lt.id, body.model_dump(), client_ip(request))
    db.commit()
    return {"id": lt.id, "code": lt.code}


@router.patch("/leave-types/{type_id}")
def update_leave_type(type_id: int, body: LeaveTypeUpdate, request: Request,
                      p: Principal = Depends(require_leave_policy_editor), db: Session = Depends(get_db)):
    lt = db.get(LeaveType, type_id)
    if lt is None:
        raise HTTPException(404, "Leave type not found")
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(lt, k, v)
    audit_service.log(db, p.user, "LEAVE_TYPE_UPDATED", "leave_type", lt.id, changes, client_ip(request))
    db.commit()
    return {"id": lt.id}


# -------------------------------------------------------------------- shifts
class ShiftIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    start_time: time
    end_time: time
    grace_minutes: int = Field(0, ge=0, le=240)
    half_day_hours: float = Field(4, gt=0, le=24)
    full_day_hours: float = Field(8, gt=0, le=24)
    is_overnight: bool = False
    is_default: bool = False
    is_active: bool = True

    @field_validator("full_day_hours")
    @classmethod
    def _hours(cls, v, info):
        if "half_day_hours" in info.data and v < info.data["half_day_hours"]:
            raise ValueError("full_day_hours must be >= half_day_hours")
        return v


def _shift_out(s: Shift) -> dict:
    return {"id": s.id, "name": s.name, "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"), "grace_minutes": s.grace_minutes,
            "half_day_hours": s.half_day_hours, "full_day_hours": s.full_day_hours,
            "is_overnight": s.is_overnight, "is_default": s.is_default, "is_active": s.is_active}


@router.get("/shifts")
def list_shifts(p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    return [_shift_out(s) for s in db.scalars(select(Shift).order_by(Shift.id))]


@router.get("/shifts/mine")
def my_shift(p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    from app.services.attendance_service import shift_resolver
    from app.services.settings_service import local_today

    info = shift_resolver(db, [p.employee.id])(p.employee.id, local_today(get_settings(db)))
    return {"name": info.name, "start_time": info.start.strftime("%H:%M"), "grace_minutes": info.grace,
            "half_day_hours": info.half, "full_day_hours": info.full}


@router.post("/shifts", status_code=201)
def create_shift(body: ShiftIn, request: Request, p: Principal = Depends(owner_only), db: Session = Depends(get_db)):
    if db.scalar(select(Shift.id).where(Shift.name == body.name.strip())):
        raise HTTPException(409, "A shift with this name already exists")
    if body.is_default:
        db.execute(update(Shift).values(is_default=False))
    s = Shift(**{**body.model_dump(), "name": body.name.strip()})
    db.add(s)
    db.flush()
    audit_service.log(db, p.user, "SHIFT_CREATED", "shift", s.id, {"name": s.name}, client_ip(request))
    db.commit()
    return _shift_out(s)


@router.patch("/shifts/{shift_id}")
def update_shift(shift_id: int, body: ShiftIn, request: Request, p: Principal = Depends(owner_only),
                 db: Session = Depends(get_db)):
    s = db.get(Shift, shift_id)
    if s is None:
        raise HTTPException(404, "Shift not found")
    if body.is_default:
        db.execute(update(Shift).where(Shift.id != s.id).values(is_default=False))
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    audit_service.log(db, p.user, "SHIFT_UPDATED", "shift", s.id, body.model_dump(mode="json"), client_ip(request))
    db.commit()
    return _shift_out(s)


class ShiftAssign(BaseModel):
    employee_id: int
    shift_id: int
    effective_from: date


@router.post("/shifts/assign", status_code=201)
def assign_shift(body: ShiftAssign, request: Request, p: Principal = Depends(owner_only), db: Session = Depends(get_db)):
    emp, shift = db.get(Employee, body.employee_id), db.get(Shift, body.shift_id)
    if emp is None or shift is None:
        raise HTTPException(404, "Employee or shift not found")
    from datetime import timedelta
    # close the currently open assignment the day before the new one starts
    for a in db.scalars(select(EmployeeShift).where(EmployeeShift.employee_id == emp.id,
                                                    EmployeeShift.effective_to.is_(None))):
        if a.effective_from >= body.effective_from:
            raise HTTPException(409, "A later or equal assignment already exists for this employee")
        a.effective_to = body.effective_from - timedelta(days=1)
    db.add(EmployeeShift(employee_id=emp.id, shift_id=shift.id, effective_from=body.effective_from))
    audit_service.log(db, p.user, "SHIFT_ASSIGNED", "employee", emp.id,
                      {"shift": shift.name, "from": body.effective_from}, client_ip(request))
    db.commit()
    return {"message": "Shift assigned"}


@router.get("/shifts/assignments/{employee_id}")
def shift_assignments(employee_id: int, p: Principal = Depends(owner_or_hr), db: Session = Depends(get_db)):
    rows = db.scalars(select(EmployeeShift).where(EmployeeShift.employee_id == employee_id)
                      .order_by(EmployeeShift.effective_from.desc()))
    names = {s.id: s.name for s in db.scalars(select(Shift))}
    return [{"id": a.id, "shift": names.get(a.shift_id), "effective_from": a.effective_from,
             "effective_to": a.effective_to} for a in rows]


# ------------------------------------------------------------------ holidays
class HolidayIn(BaseModel):
    date: date
    name: str = Field(min_length=1, max_length=150)
    holiday_type: HolidayType = HolidayType.PUBLIC


@router.get("/holidays")
def list_holidays(year: Optional[int] = Query(None, ge=2000, le=2100), p: Principal = Depends(get_active_principal),
                  db: Session = Depends(get_db)):
    stmt = select(Holiday).order_by(Holiday.date)
    if year:
        stmt = stmt.where(Holiday.date >= date(year, 1, 1), Holiday.date <= date(year, 12, 31))
    return [{"id": h.id, "date": h.date, "name": h.name, "holiday_type": h.holiday_type} for h in db.scalars(stmt)]


@router.post("/holidays", status_code=201)
def create_holiday(body: HolidayIn, request: Request, p: Principal = Depends(require_leave_policy_editor),
                   db: Session = Depends(get_db)):
    h = Holiday(date=body.date, name=body.name.strip(), holiday_type=body.holiday_type.value)
    db.add(h)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This holiday already exists")
    audit_service.log(db, p.user, "HOLIDAY_CREATED", "holiday", h.id, {"date": h.date, "name": h.name}, client_ip(request))
    db.commit()
    return {"id": h.id}


@router.delete("/holidays/{holiday_id}")
def delete_holiday(holiday_id: int, request: Request, p: Principal = Depends(require_leave_policy_editor),
                   db: Session = Depends(get_db)):
    h = db.get(Holiday, holiday_id)
    if h is None:
        raise HTTPException(404, "Holiday not found")
    audit_service.log(db, p.user, "HOLIDAY_DELETED", "holiday", h.id, {"date": h.date, "name": h.name}, client_ip(request))
    db.delete(h)
    db.commit()
    return {"message": "Deleted"}


# ------------------------------------------------------------------- offices
class OfficeIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_m: int = Field(100, ge=10, le=5000)
    is_active: bool = True


offices_router = APIRouter(prefix="/offices", tags=["offices"])


def _office_out(o: Office, full: bool) -> dict:
    out = {"id": o.id, "name": o.name, "radius_m": o.radius_m, "is_active": o.is_active}
    if full:
        out.update(latitude=o.latitude, longitude=o.longitude)
    return out


@offices_router.get("")
def list_offices(p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    full = p.is_admin
    return [_office_out(o, full) for o in db.scalars(select(Office).order_by(Office.name))
            if o.is_active or full]


@offices_router.post("", status_code=201)
def create_office(body: OfficeIn, request: Request, p: Principal = Depends(owner_only), db: Session = Depends(get_db)):
    if db.scalar(select(Office.id).where(Office.name == body.name.strip())):
        raise HTTPException(409, "An office with this name already exists")
    o = Office(**{**body.model_dump(), "name": body.name.strip()})
    db.add(o)
    db.flush()
    audit_service.log(db, p.user, "OFFICE_CREATED", "office", o.id, body.model_dump(), client_ip(request))
    db.commit()
    return _office_out(o, True)


@offices_router.patch("/{office_id}")
def update_office(office_id: int, body: OfficeIn, request: Request, p: Principal = Depends(owner_only),
                  db: Session = Depends(get_db)):
    o = db.get(Office, office_id)
    if o is None:
        raise HTTPException(404, "Office not found")
    for k, v in body.model_dump().items():
        setattr(o, k, v)
    audit_service.log(db, p.user, "OFFICE_UPDATED", "office", o.id, body.model_dump(), client_ip(request))
    db.commit()
    return _office_out(o, True)
