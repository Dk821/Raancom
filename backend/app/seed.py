"""Bootstrap and maintenance commands.

    python -m app.seed init --email owner@company.com --name "Owner Name"
    python -m app.seed purge-photos          # only acts if a retention period is configured
    python -m app.seed rollover --year 2027  # carry forward + allocate leave for a new year

`init` is safe to run again: it never overwrites existing policy rows or users.
All policy numbers below are PROPOSED DEFAULTS from the architecture document and are
editable by the Owner in the app until the client confirms them (Section 14).
"""
import argparse
import sys
from datetime import time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.enums import LedgerType, Role
from app.core.security import generate_temp_password, hash_password
from app.db.session import SessionLocal
from app.models.attendance import AttendanceEvent
from app.models.employee import Employee
from app.models.leave_type import LeaveType
from app.models.shift import Shift
from app.models.user import User
from app.services import leave_service, storage_service
from app.services.settings_service import get_settings, local_today

DEFAULT_LEAVE_TYPES = [
    # code, name, paid, half-day, tracked, entitlement, carry-forward cap
    ("CL", "Casual Leave", True, True, True, 12, 0),
    ("SL", "Sick Leave", True, True, True, 6, 0),
    ("EL", "Earned Leave", True, True, True, 0, 0),  # entitlement per company policy: set by Owner
    ("LOP", "Unpaid Leave (Loss of Pay)", False, True, False, 0, 0),
]


def seed_defaults(db: Session) -> None:
    get_settings(db)
    for code, name, paid, half, tracked, ent, cf in DEFAULT_LEAVE_TYPES:
        if not db.scalar(select(LeaveType.id).where(LeaveType.code == code)):
            db.add(LeaveType(code=code, name=name, is_paid=paid, allows_half_day=half, balance_required=tracked,
                             annual_entitlement=ent, carry_forward_max=cf))
    if not db.scalar(select(Shift.id)):
        db.add(Shift(name="General Shift", start_time=time(9, 0), end_time=time(18, 0), grace_minutes=15,
                     half_day_hours=4, full_day_hours=8, is_default=True))
    db.flush()


def create_owner(db: Session, email: str, name: str) -> str | None:
    email = email.strip().lower()
    if db.scalar(select(User.id).where(User.email == email)):
        return None
    temp = generate_temp_password()
    user = User(email=email, password_hash=hash_password(temp), role=Role.OWNER.value, must_change_password=True)
    emp = Employee(user=user, employee_code="EMP0001", full_name=name.strip(), joining_date=local_today(get_settings(db)),
                   designation="Owner")
    db.add_all([user, emp])
    db.flush()
    leave_service.allocate_entitlements(db, emp, local_today(get_settings(db)).year, None)
    return temp


def purge_photos(db: Session) -> int:
    days = get_settings(db).photo_retention_days
    if not days:
        print("No photo retention period is configured; nothing deleted.")
        return 0
    cutoff = clock.now_utc() - timedelta(days=days)
    n = 0
    for ev in db.scalars(select(AttendanceEvent).where(AttendanceEvent.occurred_at < cutoff,
                                                       AttendanceEvent.photo_key != "PURGED")):
        storage_service.delete_quietly(ev.photo_key)
        ev.photo_key = "PURGED"  # the event row (time, place, distance) is kept
        n += 1
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    init = sub.add_parser("init")
    init.add_argument("--email", required=True)
    init.add_argument("--name", required=True)
    sub.add_parser("purge-photos")
    ro = sub.add_parser("rollover")
    ro.add_argument("--year", type=int, required=True)
    args = ap.parse_args()

    with SessionLocal() as db:
        if args.cmd == "init":
            seed_defaults(db)
            temp = create_owner(db, args.email, args.name)
            db.commit()
            if temp:
                print(f"Owner created: {args.email}\nTemporary password (shown once): {temp}\n"
                      "You will be asked to change it at first login.")
            else:
                print("Defaults ensured. Owner already exists; no changes to users.")
        elif args.cmd == "purge-photos":
            n = purge_photos(db)
            db.commit()
            print(f"Purged {n} photo(s).")
        elif args.cmd == "rollover":
            print(leave_service.roll_over_year(db, args.year, None))
            db.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
