from datetime import timedelta

from app.core.enums import Role
from app.tests.conftest import PASSWORD

API = "/api/v1"


def test_login_and_me(world, team):
    r = world.client.get(f"{API}/auth/me", headers=team.h["alice"])
    assert r.status_code == 200
    assert r.json()["role"] == "EMPLOYEE"
    assert r.json()["permissions"]["manage_employees"] is False


def test_bad_password_and_lockout(world, team):
    for _ in range(5):
        r = world.client.post(f"{API}/auth/login", json={"email": "alice@example.com", "password": "wrong-password1"})
        assert r.status_code == 401
    # the 6th attempt is locked even with the correct password
    r = world.client.post(f"{API}/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    assert r.status_code == 429
    # lock expires
    world.set_now(world.now + timedelta(minutes=16))
    r = world.client.post(f"{API}/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    assert r.status_code == 200


def test_unknown_user_and_wrong_password_same_message(world, team):
    a = world.client.post(f"{API}/auth/login", json={"email": "nobody@example.com", "password": "whatever12345"})
    b = world.client.post(f"{API}/auth/login", json={"email": "alice@example.com", "password": "whatever12345"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_unauthenticated_and_logout_revokes(world, team):
    assert world.client.get(f"{API}/dashboard").status_code == 401
    assert world.client.post(f"{API}/auth/logout", headers=team.h["alice"]).status_code == 200
    assert world.client.get(f"{API}/auth/me", headers=team.h["alice"]).status_code == 401


def test_token_expires(world, team):
    world.set_now(world.now + timedelta(hours=73))
    assert world.client.get(f"{API}/auth/me", headers=team.h["alice"]).status_code == 401


def test_forced_password_change(world, team):
    r = world.client.post(f"{API}/employees", headers=team.h["hr"], json={
        "email": "new@example.com", "full_name": "New Person", "joining_date": "2026-10-01"})
    assert r.status_code == 201, r.text
    temp = r.json()["temporary_password"]
    login = world.client.post(f"{API}/auth/login", json={"email": "new@example.com", "password": temp})
    assert login.status_code == 200
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert login.json()["user"]["must_change_password"] is True
    # everything but change-password is blocked
    assert world.client.get(f"{API}/dashboard", headers=h).status_code == 403
    weak = world.client.post(f"{API}/auth/change-password", headers=h, json={"current_password": temp, "new_password": "short"})
    assert weak.status_code == 422
    ok = world.client.post(f"{API}/auth/change-password", headers=h,
                           json={"current_password": temp, "new_password": "BrandNew12345"})
    assert ok.status_code == 200
    assert world.client.get(f"{API}/dashboard", headers=h).status_code == 200


def test_hr_cannot_create_hr_or_owner(world, team):
    for role in ("HR", "OWNER"):
        r = world.client.post(f"{API}/employees", headers=team.h["hr"], json={
            "email": f"x{role}@example.com", "full_name": "Someone", "role": role, "joining_date": "2026-10-01"})
        assert r.status_code == 403, role


def test_hr_cannot_promote_self_or_others_to_owner(world, team):
    r = world.client.patch(f"{API}/employees/{team.hr.id}", headers=team.h["hr"], json={"role": "OWNER"})
    assert r.status_code == 403
    r = world.client.patch(f"{API}/employees/{team.alice.id}", headers=team.h["hr"], json={"role": "OWNER"})
    assert r.status_code == 403
    r = world.client.patch(f"{API}/employees/{team.alice.id}", headers=team.h["hr"], json={"role": "HR"})
    assert r.status_code == 403


def test_hr_cannot_touch_owner_or_hr_accounts(world, team):
    assert world.client.patch(f"{API}/employees/{team.owner.id}", headers=team.h["hr"], json={"designation": "x"}).status_code == 403
    assert world.client.post(f"{API}/employees/{team.owner.id}/deactivate", headers=team.h["hr"]).status_code == 403
    assert world.client.post(f"{API}/employees/{team.owner.id}/reset-password", headers=team.h["hr"]).status_code == 403


def test_hr_manager_creation_follows_owner_setting(world, team):
    body = {"email": "m2@example.com", "full_name": "Second Manager", "role": "REPORTING_MANAGER", "joining_date": "2026-10-01"}
    assert world.client.post(f"{API}/employees", headers=team.h["hr"], json=body).status_code == 201
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"], json={"hr_can_manage_managers": False})
    body["email"] = "m3@example.com"
    assert world.client.post(f"{API}/employees", headers=team.h["hr"], json=body).status_code == 403


def test_owner_can_create_hr(world, team):
    r = world.client.post(f"{API}/employees", headers=team.h["owner"], json={
        "email": "hr2@example.com", "full_name": "Second HR", "role": "HR", "joining_date": "2026-10-01"})
    assert r.status_code == 201


def test_role_scoped_directory_access(world, team):
    assert world.client.get(f"{API}/employees", headers=team.h["alice"]).status_code == 403
    assert world.client.get(f"{API}/employees", headers=team.h["mgr"]).status_code == 403
    assert world.client.get(f"{API}/employees", headers=team.h["hr"]).json()["total"] == 6


def test_employee_cannot_read_other_employee_by_id(world, team):
    assert world.client.get(f"{API}/employees/{team.bob.id}", headers=team.h["alice"]).status_code == 404
    assert world.client.get(f"{API}/employees/{team.alice.id}", headers=team.h["alice"]).status_code == 200


def test_manager_sees_only_assigned_employees(world, team):
    assert world.client.get(f"{API}/employees/{team.alice.id}", headers=team.h["mgr"]).status_code == 200
    assert world.client.get(f"{API}/employees/{team.carol.id}", headers=team.h["mgr"]).status_code == 404
    mine = world.client.get(f"{API}/teams/me", headers=team.h["mgr"]).json()
    assert {e["full_name"] for e in mine["items"]} == {"Alice A", "Bob B"}


def test_self_profile_update_limited_fields(world, team):
    r = world.client.patch(f"{API}/employees/me", headers=team.h["alice"], json={"phone": "99999", "role": "OWNER"})
    assert r.status_code == 200
    assert r.json()["phone"] == "99999"
    assert r.json()["role"] == "EMPLOYEE"


def test_manager_view_hides_private_fields(world, team):
    world.client.patch(f"{API}/employees/me", headers=team.h["alice"], json={"address": "12 Private Lane"})
    as_mgr = world.client.get(f"{API}/employees/{team.alice.id}", headers=team.h["mgr"]).json()
    as_hr = world.client.get(f"{API}/employees/{team.alice.id}", headers=team.h["hr"]).json()
    assert "address" not in as_mgr
    assert as_hr["address"] == "12 Private Lane"


def test_deactivate_blocks_login_and_keeps_history(world, team):
    r = world.client.post(f"{API}/employees/{team.carol.id}/deactivate", headers=team.h["hr"])
    assert r.status_code == 200
    assert world.client.get(f"{API}/auth/me", headers=team.h["carol"]).status_code == 401
    assert world.client.post(f"{API}/auth/login", json={"email": "carol@example.com", "password": PASSWORD}).status_code == 401
    # record still exists
    assert world.client.get(f"{API}/employees/{team.carol.id}", headers=team.h["hr"]).json()["status"] == "INACTIVE"


def test_cannot_deactivate_manager_with_reports_or_last_owner(world, team):
    assert world.client.post(f"{API}/employees/{team.mgr.id}/deactivate", headers=team.h["hr"]).status_code == 409
    assert world.client.post(f"{API}/employees/{team.owner.id}/deactivate", headers=team.h["owner"]).status_code == 403  # self


def test_reporting_loop_rejected(world, team):
    r = world.client.patch(f"{API}/employees/{team.owner.id}", headers=team.h["owner"], json={"manager_id": team.mgr.id})
    assert r.status_code == 422


def test_reset_password_forces_change_and_revokes(world, team):
    r = world.client.post(f"{API}/employees/{team.alice.id}/reset-password", headers=team.h["hr"])
    assert r.status_code == 200 and r.json()["temporary_password"]
    assert world.client.get(f"{API}/auth/me", headers=team.h["alice"]).status_code == 401


def test_audit_log_owner_only_and_no_secrets(world, team):
    world.client.post(f"{API}/employees", headers=team.h["hr"], json={
        "email": "aud@example.com", "full_name": "Audit Me", "joining_date": "2026-10-01"})
    assert world.client.get(f"{API}/audit-logs", headers=team.h["hr"]).status_code == 403
    assert world.client.get(f"{API}/audit-logs", headers=team.h["mgr"]).status_code == 403
    r = world.client.get(f"{API}/audit-logs", headers=team.h["owner"])
    assert r.status_code == 200
    text = r.text.lower()
    assert "employee_created" in text
    assert "password" not in text.replace("auth_password", "").replace("password_reset", "")
    assert "argon2" not in text


def test_policy_edit_permissions(world, team):
    assert world.client.put(f"{API}/policies/settings", headers=team.h["hr"], json={"timezone": "UTC"}).status_code == 403
    assert world.client.put(f"{API}/policies/settings", headers=team.h["alice"], json={"timezone": "UTC"}).status_code == 403
    assert world.client.put(f"{API}/policies/settings", headers=team.h["owner"], json={"timezone": "Mars/Base"}).status_code == 422
    body = {"code": "PL", "name": "Paternity"}
    assert world.client.post(f"{API}/policies/leave-types", headers=team.h["hr"], json=body).status_code == 403
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"], json={"hr_can_edit_leave_policy": True})
    assert world.client.post(f"{API}/policies/leave-types", headers=team.h["hr"], json=body).status_code == 201
    assert world.client.post(f"{API}/offices", headers=team.h["hr"], json={
        "name": "X", "latitude": 1, "longitude": 1}).status_code == 403


def test_office_coordinates_hidden_from_employees(world, team):
    world.office()
    emp_view = world.client.get(f"{API}/offices", headers=team.h["alice"]).json()[0]
    assert "latitude" not in emp_view
    assert "latitude" in world.client.get(f"{API}/offices", headers=team.h["hr"]).json()[0]
