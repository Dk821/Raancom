from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_active_principal, require_roles
from app.core.enums import Role
from app.core.permissions import Principal, employee_for_view, load_employee_or_404, team_clause
from app.db.session import get_db
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, SelfUpdate
from app.services import employee_service as svc

router = APIRouter(tags=["employees"])
admin = require_roles(Role.OWNER, Role.HR)


@router.get("/employees")
def list_employees(
    q: Optional[str] = None, department: Optional[str] = None, role: Optional[Role] = None,
    status: Optional[str] = None, manager_id: Optional[int] = None,
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    p: Principal = Depends(admin), db: Session = Depends(get_db),
):
    rows, total = svc.list_employees(db, team_clause(p), q, department, role.value if role else None, status,
                                     manager_id, limit, offset)
    return {"items": [svc.employee_out(e, p) for e in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/employees/departments")
def departments(p: Principal = Depends(require_roles(Role.OWNER, Role.HR, Role.REPORTING_MANAGER)),
                db: Session = Depends(get_db)):
    from sqlalchemy import select
    from app.models.employee import Employee

    stmt = select(Employee.department).where(team_clause(p), Employee.department.isnot(None)).distinct()
    return sorted(d for d in db.scalars(stmt) if d)


@router.get("/employees/managers")
def manager_candidates(p: Principal = Depends(admin), db: Session = Depends(get_db)):
    """Active people who can be chosen as a reporting manager."""
    from sqlalchemy import select
    from app.core.enums import EmploymentStatus
    from app.models.employee import Employee
    from app.models.user import User

    stmt = (select(Employee).join(User, User.id == Employee.user_id)
            .where(User.role.in_(svc.MANAGER_ROLES), Employee.status == EmploymentStatus.ACTIVE.value)
            .order_by(Employee.full_name))
    return [{"id": e.id, "full_name": e.full_name, "employee_code": e.employee_code, "role": e.user.role}
            for e in db.scalars(stmt)]


@router.post("/employees", status_code=201)
def create_employee(body: EmployeeCreate, request: Request, p: Principal = Depends(admin), db: Session = Depends(get_db)):
    emp, temp = svc.create_employee(db, p, body, client_ip(request))
    db.commit()
    # The temporary password is shown exactly once and never stored in clear text.
    return {"employee": svc.employee_out(emp, p), "temporary_password": temp}


@router.get("/employees/me")
def my_profile(p: Principal = Depends(get_active_principal)):
    return svc.employee_out(p.employee, p)


@router.patch("/employees/me")
def update_my_profile(body: SelfUpdate, request: Request, p: Principal = Depends(get_active_principal),
                      db: Session = Depends(get_db)):
    emp = svc.update_self(db, p, body, client_ip(request))
    db.commit()
    return svc.employee_out(emp, p)


@router.get("/teams/me")
def my_team(p: Principal = Depends(require_roles(Role.REPORTING_MANAGER)), db: Session = Depends(get_db)):
    rows, total = svc.list_employees(db, team_clause(p), None, None, None, None, None, 500, 0)
    return {"items": [svc.employee_out(e, p) for e in rows], "total": total}


@router.get("/employees/{employee_id}")
def get_employee(employee_id: int, p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)):
    return svc.employee_out(employee_for_view(db, p, employee_id), p)


@router.patch("/employees/{employee_id}")
def update_employee(employee_id: int, body: EmployeeUpdate, request: Request, p: Principal = Depends(admin),
                    db: Session = Depends(get_db)):
    emp = svc.update_employee(db, p, load_employee_or_404(db, employee_id), body, client_ip(request))
    db.commit()
    return svc.employee_out(emp, p)


@router.post("/employees/{employee_id}/deactivate")
def deactivate(employee_id: int, request: Request, p: Principal = Depends(admin), db: Session = Depends(get_db)):
    emp = svc.deactivate(db, p, load_employee_or_404(db, employee_id), client_ip(request))
    db.commit()
    return svc.employee_out(emp, p)


@router.post("/employees/{employee_id}/reactivate")
def reactivate(employee_id: int, request: Request, p: Principal = Depends(admin), db: Session = Depends(get_db)):
    emp = svc.reactivate(db, p, load_employee_or_404(db, employee_id), client_ip(request))
    db.commit()
    return svc.employee_out(emp, p)


@router.post("/employees/{employee_id}/reset-password")
def reset_password(employee_id: int, request: Request, p: Principal = Depends(admin), db: Session = Depends(get_db)):
    temp = svc.reset_password(db, p, load_employee_or_404(db, employee_id), client_ip(request))
    db.commit()
    return {"temporary_password": temp}
