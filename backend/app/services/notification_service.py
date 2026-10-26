from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import EmploymentStatus, Role
from app.models.employee import Employee
from app.models.notification import Notification
from app.models.user import User


def notify(db: Session, user_id: int, title: str, body: str | None = None, link: str | None = None) -> None:
    db.add(Notification(user_id=user_id, title=title[:200], body=body, link=link))


def notify_many(db: Session, user_ids: Iterable[int], title: str, body: str | None = None, link: str | None = None) -> None:
    for uid in set(user_ids):
        notify(db, uid, title, body, link)


def user_ids_with_roles(db: Session, roles: tuple[Role, ...]) -> list[int]:
    stmt = (
        select(User.id)
        .join(Employee, Employee.user_id == User.id)
        .where(User.role.in_([r.value for r in roles]), User.is_active.is_(True), Employee.status == EmploymentStatus.ACTIVE.value)
    )
    return list(db.scalars(stmt))
