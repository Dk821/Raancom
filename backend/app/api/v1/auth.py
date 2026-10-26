from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_principal
from app.core.config import get_config
from app.core.enums import Role
from app.core.permissions import Principal
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest
from app.schemas.common import Message
from app.services import audit_service, auth_service
from app.services.settings_service import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


def me_payload(db: Session, user: User) -> dict:
    emp = user.employee
    s = get_settings(db)
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "must_change_password": user.must_change_password,
        "employee": {
            "id": emp.id, "employee_code": emp.employee_code, "full_name": emp.full_name,
            "department": emp.department, "designation": emp.designation, "manager_id": emp.manager_id,
            "joining_date": emp.joining_date,
        },
        "permissions": {
            "manage_employees": user.role in (Role.OWNER.value, Role.HR.value),
            "edit_company_policy": user.role == Role.OWNER.value,
            "edit_leave_policy": user.role == Role.OWNER.value or (user.role == Role.HR.value and s.hr_can_edit_leave_policy),
            "view_reports": user.role != Role.EMPLOYEE.value,
            "approve_requests": user.role != Role.EMPLOYEE.value,
            "view_audit": user.role == Role.OWNER.value,
        },
        "company": {"name": s.company_name, "timezone": s.timezone},
    }


@router.post("/login")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    token, user = auth_service.login(db, body.email, body.password, client_ip(request), request.headers.get("user-agent"))
    return {
        "access_token": token, "token_type": "bearer", "expires_in": get_config().access_token_minutes * 60,
        "user": me_payload(db, user),
    }


@router.post("/logout", response_model=Message)
def logout(request: Request, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    auth_service.revoke_session(db, p.session)
    audit_service.log(db, p.user, "AUTH_LOGOUT", "user", p.user.id, ip=client_ip(request))
    db.commit()
    return {"message": "Signed out"}


@router.get("/me")
def me(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    return me_payload(db, p.user)


@router.post("/change-password", response_model=Message)
def change_password(body: ChangePasswordRequest, request: Request, p: Principal = Depends(get_principal),
                    db: Session = Depends(get_db)):
    auth_service.change_password(db, p.user, body.current_password, body.new_password, p.session.id, client_ip(request))
    db.commit()
    return {"message": "Password changed"}
