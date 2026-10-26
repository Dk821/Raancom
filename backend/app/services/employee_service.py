from datetime import date

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import clock
from app.core.enums import EmploymentStatus, Role
from app.core.permissions import Principal
from app.core.security import generate_temp_password, hash_password
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, SelfUpdate
from app.services import audit_service, auth_service, leave_service
from app.services.settings_service import get_settings, local_today

MANAGER_ROLES = (Role.REPORTING_MANAGER.value, Role.HR.value, Role.OWNER.value)


def employee_out(emp: Employee, viewer: Principal) -> dict:
    full = viewer.role in (Role.OWNER.value, Role.HR.value) or viewer.employee.id == emp.id
    out = {
        "id": emp.id,
        "employee_code": emp.employee_code,
        "full_name": emp.full_name,
        "email": emp.user.email,
        "role": emp.user.role,
        "department": emp.department,
        "designation": emp.designation,
        "joining_date": emp.joining_date,
        "manager_id": emp.manager_id,
        "manager_name": emp.manager.full_name if emp.manager else None,
        "status": emp.status,
        "is_active": emp.user.is_active,
        "phone": emp.phone,
    }
    if full:
        out.update(
            address=emp.address,
            emergency_contact_name=emp.emergency_contact_name,
            emergency_contact_phone=emp.emergency_contact_phone,
            last_login_at=emp.user.last_login_at,
        )
    return out


# ---------------------------------------------------------------- permissions
def _assert_can_manage_role(db: Session, actor: Principal, target_role: str) -> None:
    """Owner manages everyone. HR manages Employee accounts and, if the Owner allows it,
    Reporting Manager accounts. HR can never touch HR/Owner accounts."""
    if actor.role == Role.OWNER.value:
        return
    if actor.role == Role.HR.value:
        if target_role == Role.EMPLOYEE.value:
            return
        if target_role == Role.REPORTING_MANAGER.value and get_settings(db).hr_can_manage_managers:
            return
    raise HTTPException(403, "You do not have permission to manage accounts with this role")


def _active_owner_count(db: Session) -> int:
    return db.scalar(
        select(func.count(User.id)).where(User.role == Role.OWNER.value, User.is_active.is_(True))
    ) or 0


def _validate_manager(db: Session, manager_id: int, employee_id: int | None) -> Employee:
    mgr = db.get(Employee, manager_id)
    if mgr is None or mgr.status != EmploymentStatus.ACTIVE.value:
        raise HTTPException(422, "Selected reporting manager was not found or is inactive")
    if mgr.user.role not in MANAGER_ROLES:
        raise HTTPException(422, "Selected person does not have a manager role")
    if employee_id is not None:
        if manager_id == employee_id:
            raise HTTPException(422, "An employee cannot report to themselves")
        cur, seen = mgr, set()
        while cur is not None and cur.id not in seen:  # reject reporting cycles
            if cur.manager_id == employee_id:
                raise HTTPException(422, "This assignment would create a reporting loop")
            seen.add(cur.id)
            cur = cur.manager
    return mgr


def _direct_report_count(db: Session, employee_id: int) -> int:
    return db.scalar(
        select(func.count(Employee.id)).where(
            Employee.manager_id == employee_id, Employee.status == EmploymentStatus.ACTIVE.value
        )
    ) or 0


def _next_code(db: Session) -> str:
    n = (db.scalar(select(func.count(Employee.id))) or 0) + 1
    while True:
        code = f"EMP{n:04d}"
        if not db.scalar(select(Employee.id).where(Employee.employee_code == code)):
            return code
        n += 1


# ----------------------------------------------------------------- operations
def create_employee(db: Session, actor: Principal, data: EmployeeCreate, ip: str | None) -> tuple[Employee, str]:
    _assert_can_manage_role(db, actor, data.role.value)
    email = data.email.strip().lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    code = (data.employee_code or "").strip().upper() or _next_code(db)
    if db.scalar(select(Employee.id).where(Employee.employee_code == code)):
        raise HTTPException(409, "Employee code already exists")
    if data.manager_id is not None:
        _validate_manager(db, data.manager_id, None)

    temp = generate_temp_password()
    user = User(email=email, password_hash=hash_password(temp), role=data.role.value, must_change_password=True)
    emp = Employee(
        user=user, employee_code=code, full_name=data.full_name.strip(), department=data.department,
        designation=data.designation, joining_date=data.joining_date, manager_id=data.manager_id, phone=data.phone,
    )
    db.add_all([user, emp])
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email or employee code already exists")
    leave_service.allocate_entitlements(db, emp, max(data.joining_date.year, local_today(get_settings(db)).year), actor.user.id)
    audit_service.log(db, actor.user, "EMPLOYEE_CREATED", "employee", emp.id,
                      {"email": email, "role": data.role.value, "code": code}, ip)
    return emp, temp


def update_employee(db: Session, actor: Principal, emp: Employee, data: EmployeeUpdate, ip: str | None) -> Employee:
    _assert_can_manage_role(db, actor, emp.user.role)
    changes: dict = {}
    fields = data.model_dump(exclude_unset=True)

    if "role" in fields and fields["role"] is not None and fields["role"].value != emp.user.role:
        new_role = fields["role"].value
        if emp.id == actor.employee.id:
            raise HTTPException(403, "You cannot change your own role")
        _assert_can_manage_role(db, actor, new_role)
        if emp.user.role == Role.OWNER.value and _active_owner_count(db) <= 1:
            raise HTTPException(409, "Cannot change the role of the last active Owner")
        if emp.user.role in MANAGER_ROLES and new_role == Role.EMPLOYEE.value and _direct_report_count(db, emp.id):
            raise HTTPException(409, "Reassign this person's direct reports before changing the role")
        changes["role"] = {"from": emp.user.role, "to": new_role}
        emp.user.role = new_role
        auth_service.revoke_all_sessions(db, emp.user_id)  # force re-login with the new role

    if data.clear_manager:
        emp.manager_id = None
        changes["manager_id"] = None
    elif "manager_id" in fields and fields["manager_id"] is not None and fields["manager_id"] != emp.manager_id:
        _validate_manager(db, fields["manager_id"], emp.id)
        changes["manager_id"] = {"from": emp.manager_id, "to": fields["manager_id"]}
        emp.manager_id = fields["manager_id"]

    for f in ("full_name", "department", "designation", "joining_date", "phone"):
        if f in fields and fields[f] is not None and getattr(emp, f) != fields[f]:
            changes[f] = "updated"
            setattr(emp, f, fields[f])

    audit_service.log(db, actor.user, "EMPLOYEE_UPDATED", "employee", emp.id, changes, ip)
    return emp


def update_self(db: Session, actor: Principal, data: SelfUpdate, ip: str | None) -> Employee:
    emp = actor.employee
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(emp, f, v)
    audit_service.log(db, actor.user, "PROFILE_UPDATED", "employee", emp.id, {"fields": list(data.model_dump(exclude_unset=True))}, ip)
    return emp


def deactivate(db: Session, actor: Principal, emp: Employee, ip: str | None) -> Employee:
    _assert_can_manage_role(db, actor, emp.user.role)
    if emp.id == actor.employee.id:
        raise HTTPException(403, "You cannot deactivate your own account")
    if emp.user.role == Role.OWNER.value and _active_owner_count(db) <= 1:
        raise HTTPException(409, "Cannot deactivate the last active Owner")
    n = _direct_report_count(db, emp.id)
    if n:
        raise HTTPException(409, f"Reassign this person's {n} direct report(s) before deactivating")
    emp.status = EmploymentStatus.INACTIVE.value
    emp.deactivated_at = clock.now_utc()
    emp.user.is_active = False
    auth_service.revoke_all_sessions(db, emp.user_id)
    audit_service.log(db, actor.user, "EMPLOYEE_DEACTIVATED", "employee", emp.id, None, ip)
    return emp


def reactivate(db: Session, actor: Principal, emp: Employee, ip: str | None) -> Employee:
    _assert_can_manage_role(db, actor, emp.user.role)
    emp.status = EmploymentStatus.ACTIVE.value
    emp.deactivated_at = None
    emp.user.is_active = True
    audit_service.log(db, actor.user, "EMPLOYEE_REACTIVATED", "employee", emp.id, None, ip)
    return emp


def reset_password(db: Session, actor: Principal, emp: Employee, ip: str | None) -> str:
    _assert_can_manage_role(db, actor, emp.user.role)
    if emp.id == actor.employee.id:
        raise HTTPException(403, "Use 'change password' for your own account")
    temp = generate_temp_password()
    emp.user.password_hash = hash_password(temp)
    emp.user.must_change_password = True
    emp.user.failed_login_count = 0
    emp.user.locked_until = None
    auth_service.revoke_all_sessions(db, emp.user_id)
    audit_service.log(db, actor.user, "EMPLOYEE_PASSWORD_RESET", "employee", emp.id, None, ip)
    return temp


def list_employees(
    db: Session, scope_clause, q: str | None, department: str | None, role: str | None,
    status: str | None, manager_id: int | None, limit: int, offset: int,
) -> tuple[list[Employee], int]:
    stmt = select(Employee).join(User, User.id == Employee.user_id).where(scope_clause)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(func.lower(Employee.full_name).like(like), func.lower(Employee.employee_code).like(like),
                func.lower(User.email).like(like))
        )
    if department:
        stmt = stmt.where(Employee.department == department)
    if role:
        stmt = stmt.where(User.role == role)
    if status:
        stmt = stmt.where(Employee.status == status)
    if manager_id:
        stmt = stmt.where(Employee.manager_id == manager_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(stmt.order_by(Employee.full_name).limit(limit).offset(offset)))
    return rows, total
