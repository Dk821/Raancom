from datetime import datetime, time, timedelta
from datetime import date as date_t
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.enums import Role
from app.core.permissions import Principal
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.settings_service import get_settings, get_tz

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("")
def list_logs(
    action: Optional[str] = None, entity_type: Optional[str] = None, actor_user_id: Optional[int] = None,
    from_date: Optional[date_t] = Query(None, alias="from"), to_date: Optional[date_t] = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    p: Principal = Depends(require_roles(Role.OWNER)), db: Session = Depends(get_db),
):
    tz = get_tz(get_settings(db))
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action.upper()}%"))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if actor_user_id:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    if from_date:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(from_date, time.min, tzinfo=tz))
    if to_date:
        stmt = stmt.where(AuditLog.created_at < datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=tz))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).limit(limit).offset(offset))
    names = {u.id: (u.employee.full_name if u.employee else u.email) for u in db.scalars(select(User))}
    items = [{"id": a.id, "created_at": a.created_at, "actor": names.get(a.actor_user_id), "actor_role": a.actor_role,
              "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id, "details": a.details,
              "ip": a.ip} for a in rows]
    return {"items": items, "total": total, "limit": limit, "offset": offset}
