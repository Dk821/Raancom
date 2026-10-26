import os
import tempfile
from datetime import date, datetime, timezone

_tmp = tempfile.mkdtemp(prefix="raancom_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SECRET_KEY"] = "test-secret-key-test-secret-key-1234567890"
os.environ["PRIVATE_STORAGE_DIR"] = f"{_tmp}/private"
os.environ["ENVIRONMENT"] = "development"
os.environ["ACCESS_TOKEN_MINUTES"] = "4320"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core import clock  # noqa: E402
from app.core.enums import Role  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, Employee, Office, User  # noqa: E402
from app.seed import seed_defaults  # noqa: E402
from app.services import auth_service, leave_service  # noqa: E402

PASSWORD = "Sup3rSecret99"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
# Monday 26 Oct 2026, 09:30 IST
MONDAY_0930_IST = datetime(2026, 10, 26, 4, 0, tzinfo=timezone.utc)
OFFICE = (12.9716, 77.5946)


class World:
    """Test helper: users, logins, clock control and HTTP shortcuts."""

    def __init__(self, client, db):
        self.client, self.db = client, db
        self.now = MONDAY_0930_IST

    def set_now(self, dt):
        self.now = dt

    def make(self, role: Role, email: str, name: str | None = None, manager: Employee | None = None,
             joined: date = date(2025, 1, 1)) -> Employee:
        user = User(email=email, password_hash=hash_password(PASSWORD), role=role.value, must_change_password=False)
        emp = Employee(user=user, employee_code=f"T{email.split('@')[0].upper()[:10]}", full_name=name or email.split("@")[0],
                       joining_date=joined, manager_id=manager.id if manager else None, department="Ops")
        self.db.add_all([user, emp])
        self.db.flush()
        leave_service.allocate_entitlements(self.db, emp, 2026, None)
        self.db.commit()
        return emp

    def login(self, email: str) -> dict:
        r = self.client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def office(self, radius=100):
        o = Office(name="HQ", latitude=OFFICE[0], longitude=OFFICE[1], radius_m=radius)
        self.db.add(o)
        self.db.commit()
        return o

    def punch(self, headers, event_type="CHECK_IN", mode="OFFICE", lat=OFFICE[0], lon=OFFICE[1], acc=15, remark=None,
              photo=JPEG, name="p.jpg"):
        data = {"event_type": event_type, "mode": mode}
        if lat is not None:
            data.update(latitude=str(lat), longitude=str(lon))
        if acc is not None:
            data["accuracy_m"] = str(acc)
        if remark:
            data["remark"] = remark
        files = {"photo": (name, photo, "image/jpeg")} if photo is not None else None
        return self.client.post("/api/v1/attendance/events", data=data, files=files, headers=headers)


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    auth_service.reset_rate_limits()
    with SessionLocal() as db:
        seed_defaults(db)
        db.commit()
    holder = {"w": None}
    monkeypatch.setattr(clock, "now_utc", lambda: holder["w"].now if holder["w"] else MONDAY_0930_IST)
    yield holder


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def world(db, fresh_db):
    w = World(TestClient(app), db)
    fresh_db["w"] = w
    return w


@pytest.fixture
def team(world):
    """owner, hr, manager, alice+bob (report to manager), carol (no manager), dave (reports to owner)."""
    t = type("Team", (), {})()
    t.owner = world.make(Role.OWNER, "owner@example.com", "Olivia Owner")
    t.hr = world.make(Role.HR, "hr@example.com", "Harry HR", manager=t.owner)
    t.mgr = world.make(Role.REPORTING_MANAGER, "mgr@example.com", "Mona Manager", manager=t.owner)
    t.alice = world.make(Role.EMPLOYEE, "alice@example.com", "Alice A", manager=t.mgr)
    t.bob = world.make(Role.EMPLOYEE, "bob@example.com", "Bob B", manager=t.mgr)
    t.carol = world.make(Role.EMPLOYEE, "carol@example.com", "Carol C")
    t.h = {n: world.login(f"{n}@example.com") for n in ("owner", "hr", "mgr", "alice", "bob", "carol")}
    return t
