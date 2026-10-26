import time
from collections import defaultdict, deque
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import get_config
from app.core.enums import EmploymentStatus
from app.core.security import (
    create_access_token,
    hash_password,
    new_session_id,
    password_needs_rehash,
    session_expiry,
    validate_password_strength,
    verify_password,
)
from app.models.user import AuthSession, User
from app.services import audit_service

# Per-IP sliding window (in-process). Behind several workers use Nginx limit_req as well.
_ip_attempts: dict[str, deque] = defaultdict(deque)


def _check_ip_rate(ip: str | None) -> None:
    if not ip:
        return
    cfg = get_config()
    now = time.monotonic()
    q = _ip_attempts[ip]
    while q and now - q[0] > cfg.ip_rate_limit_window_seconds:
        q.popleft()
    if len(q) >= cfg.ip_rate_limit_attempts:
        raise HTTPException(429, "Too many login attempts. Try again later.")
    q.append(now)


def reset_rate_limits() -> None:  # used by tests
    _ip_attempts.clear()


def login(db: Session, email: str, password: str, ip: str | None, user_agent: str | None):
    cfg = get_config()
    _check_ip_rate(ip)
    now = clock.now_utc()
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    generic = HTTPException(401, "Invalid email or password")

    if user is not None and user.locked_until and user.locked_until > now:
        verify_password(password, None)
        raise HTTPException(429, "Account temporarily locked after repeated failed attempts. Try again later.")

    ok = verify_password(password, user.password_hash if user else None)
    if not ok or user is None:
        if user is not None:
            user.failed_login_count += 1
            if user.failed_login_count >= cfg.login_max_attempts:
                user.locked_until = now + timedelta(minutes=cfg.login_lockout_minutes)
                user.failed_login_count = 0
                audit_service.log(db, user, "AUTH_ACCOUNT_LOCKED", "user", user.id, ip=ip)
            audit_service.log(db, user, "AUTH_LOGIN_FAILED", "user", user.id, ip=ip)
            db.commit()
        raise generic

    emp = user.employee
    if not user.is_active or emp is None or emp.status != EmploymentStatus.ACTIVE.value:
        audit_service.log(db, user, "AUTH_LOGIN_DENIED_INACTIVE", "user", user.id, ip=ip)
        db.commit()
        raise generic

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    session = AuthSession(
        id=new_session_id(), user_id=user.id, expires_at=session_expiry(), ip=ip,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(session)
    audit_service.log(db, user, "AUTH_LOGIN", "user", user.id, ip=ip)
    db.commit()
    token = create_access_token(user.id, session.id, session.expires_at)
    return token, user


def revoke_session(db: Session, session: AuthSession) -> None:
    session.revoked_at = clock.now_utc()


def revoke_all_sessions(db: Session, user_id: int, except_session_id: str | None = None) -> None:
    stmt = update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    if except_session_id:
        stmt = stmt.where(AuthSession.id != except_session_id)
    db.execute(stmt.values(revoked_at=clock.now_utc()))


def change_password(db: Session, user: User, current: str, new: str, session_id: str | None, ip: str | None) -> None:
    if not verify_password(current, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    if current == new:
        raise HTTPException(400, "New password must differ from the current password")
    try:
        validate_password_strength(new)
    except ValueError as e:
        raise HTTPException(422, str(e))
    user.password_hash = hash_password(new)
    user.must_change_password = False
    user.password_changed_at = clock.now_utc()
    revoke_all_sessions(db, user.id, except_session_id=session_id)
    audit_service.log(db, user, "AUTH_PASSWORD_CHANGED", "user", user.id, ip=ip)
