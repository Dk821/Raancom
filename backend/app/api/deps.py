from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import get_config
from app.core.enums import EmploymentStatus, Role
from app.core.permissions import Principal
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.company_setting import CompanySetting
from app.models.user import AuthSession, User
from app.services.settings_service import get_settings

_bearer = HTTPBearer(auto_error=False)


def client_ip(request: Request) -> str | None:
    if get_config().trust_proxy_headers:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()[:64]
    return request.client.host[:64] if request.client else None


def get_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Principal:
    """Authenticated principal. Does NOT enforce the forced password change."""
    unauth = HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    if creds is None:
        raise unauth
    payload = decode_access_token(creds.credentials)
    if not payload:
        raise unauth
    session = db.get(AuthSession, payload.get("sid"))
    now = clock.now_utc()
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        raise unauth
    user = db.get(User, session.user_id)
    if user is None or not user.is_active or str(user.id) != str(payload.get("sub")):
        raise unauth
    emp = user.employee
    if emp is None or emp.status != EmploymentStatus.ACTIVE.value:
        raise unauth
    return Principal(user=user, employee=emp, session=session)


def get_active_principal(p: Principal = Depends(get_principal)) -> Principal:
    if p.user.must_change_password:
        raise HTTPException(403, "PASSWORD_CHANGE_REQUIRED")
    return p


def require_roles(*roles: Role):
    allowed = {r.value for r in roles}

    def dep(p: Principal = Depends(get_active_principal)) -> Principal:
        if p.role not in allowed:
            raise HTTPException(403, "You do not have permission to perform this action")
        return p

    return dep


def require_leave_policy_editor(
    p: Principal = Depends(get_active_principal), db: Session = Depends(get_db)
) -> Principal:
    if p.role == Role.OWNER.value:
        return p
    if p.role == Role.HR.value:
        s: CompanySetting = get_settings(db)
        if s.hr_can_edit_leave_policy:
            return p
    raise HTTPException(403, "You do not have permission to edit this policy")
