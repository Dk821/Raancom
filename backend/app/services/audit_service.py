from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User

_SENSITIVE = ("password", "token", "secret", "hash", "photo_bytes")


def _clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items() if not any(s in k.lower() for s in _SENSITIVE)}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def log(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    details: dict | None = None,
    ip: str | None = None,
) -> None:
    """Adds an audit row to the caller's transaction (committed or rolled back with it)."""
    db.add(
        AuditLog(
            actor_user_id=actor.id if actor else None,
            actor_role=actor.role if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=_clean(details) if details else None,
            ip=ip,
        )
    )
