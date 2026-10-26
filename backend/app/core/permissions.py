"""Role checks and record-level scoping. Every route goes through these helpers;
the frontend only hides UI, the backend enforces."""
from dataclasses import dataclass

from sqlalchemy import false, true
from sqlalchemy.orm import Session

from app.core.enums import Role
from app.models.employee import Employee
from app.models.user import AuthSession, User


@dataclass
class Principal:
    user: User
    employee: Employee
    session: AuthSession | None = None

    @property
    def role(self) -> str:
        return self.user.role

    @property
    def is_admin(self) -> bool:  # Owner or HR
        return self.role in (Role.OWNER.value, Role.HR.value)


def team_clause(p: Principal):
    """SQL filter for employees whose records the principal may see as 'team'
    (excludes the principal's own record unless Owner/HR)."""
    if p.role in (Role.OWNER.value, Role.HR.value):
        return true()
    if p.role == Role.REPORTING_MANAGER.value:
        return Employee.manager_id == p.employee.id
    return false()


def scope_clause(p: Principal):
    """Team scope plus the principal's own record."""
    if p.role in (Role.OWNER.value, Role.HR.value):
        return true()
    if p.role == Role.REPORTING_MANAGER.value:
        return (Employee.manager_id == p.employee.id) | (Employee.id == p.employee.id)
    return Employee.id == p.employee.id


def can_view_employee(p: Principal, target: Employee) -> bool:
    if target.id == p.employee.id:
        return True
    if p.role in (Role.OWNER.value, Role.HR.value):
        return True
    if p.role == Role.REPORTING_MANAGER.value and target.manager_id == p.employee.id:
        return True
    return False


def is_manager_of(p: Principal, target: Employee) -> bool:
    return target.manager_id is not None and target.manager_id == p.employee.id


def load_employee_or_404(db: Session, employee_id: int) -> Employee:
    from fastapi import HTTPException

    emp = db.get(Employee, employee_id)
    if emp is None:
        raise HTTPException(404, "Employee not found")
    return emp


def employee_for_view(db: Session, p: Principal, employee_id: int) -> Employee:
    """Load an employee the principal may view. Returns 404 (not 403) when out of
    scope so IDs of other people's records are not revealed."""
    from fastapi import HTTPException

    emp = db.get(Employee, employee_id)
    if emp is None or not can_view_employee(p, emp):
        raise HTTPException(404, "Employee not found")
    return emp
