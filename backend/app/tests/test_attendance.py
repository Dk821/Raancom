from datetime import datetime, timedelta, timezone

from app.services.geofence_service import haversine_m
from app.tests.conftest import JPEG, OFFICE

API = "/api/v1"


def test_haversine_known_distance():
    # ~111.2 km per degree of latitude
    d = haversine_m(0, 0, 1, 0)
    assert 111_000 < d < 111_400
    assert haversine_m(12.9, 77.5, 12.9, 77.5) == 0


def test_office_checkin_inside_radius(world, team):
    world.office(100)
    r = world.punch(team.h["alice"])
    assert r.status_code == 201, r.text
    ev = r.json()["event"]
    assert ev["geofence_status"] == "INSIDE" and ev["review_status"] == "OK"
    assert ev["distance_m"] < 1 and ev["radius_m"] == 100


def test_office_checkin_outside_radius_is_flagged_and_queued(world, team):
    world.office(100)
    r = world.punch(team.h["alice"], lat=OFFICE[0] + 0.01)  # ~1.1 km away
    assert r.status_code == 201
    ev = r.json()["event"]
    assert ev["geofence_status"] == "OUTSIDE" and ev["review_status"] == "FLAGGED"
    assert ev["distance_m"] > 1000
    q = world.client.get(f"{API}/attendance/exceptions", headers=team.h["mgr"]).json()
    assert [e["employee_name"] for e in q["flagged"]] == ["Alice A"]
    # manager of someone else does not see it
    assert world.client.get(f"{API}/attendance/exceptions", headers=team.h["carol"]).status_code == 403
    # review it
    ev_id = ev["id"]
    assert world.client.post(f"{API}/attendance/events/{ev_id}/review", headers=team.h["mgr"],
                             json={"note": "Client visit confirmed"}).status_code == 200
    q = world.client.get(f"{API}/attendance/exceptions", headers=team.h["mgr"]).json()
    assert q["flagged"] == []


def test_outside_radius_can_be_blocked_by_policy(world, team):
    world.office(100)
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"], json={"outside_radius_action": "BLOCK"})
    r = world.punch(team.h["alice"], lat=OFFICE[0] + 0.01)
    assert r.status_code == 422 and "within 100 m" in r.json()["detail"]
    # nothing saved
    assert world.client.get(f"{API}/attendance/today", headers=team.h["alice"]).json()["state"] == "NOT_STARTED"


def test_poor_accuracy_and_missing_location_are_flagged(world, team):
    world.office(100)
    r = world.punch(team.h["alice"], acc=900)
    assert r.json()["event"]["geofence_status"] == "LOW_ACCURACY"
    assert r.json()["event"]["review_status"] == "FLAGGED"
    r = world.punch(team.h["bob"], lat=None, lon=None, acc=None)
    assert r.json()["event"]["geofence_status"] == "NO_LOCATION"
    assert r.json()["event"]["review_status"] == "FLAGGED"


def test_office_mode_requires_configured_office(world, team):
    r = world.punch(team.h["alice"])
    assert r.status_code == 409


def test_wfh_and_outside_require_remark(world, team):
    assert world.punch(team.h["alice"], mode="WFH").status_code == 422
    assert world.punch(team.h["alice"], mode="OUTSIDE_WORK", remark="  ").status_code == 422
    r = world.punch(team.h["alice"], mode="WFH", remark="Working from home - broadband repair")
    assert r.status_code == 201
    assert r.json()["event"]["geofence_status"] == "NOT_APPLICABLE"


def test_photo_is_mandatory_and_validated(world, team):
    world.office()
    assert world.punch(team.h["alice"], photo=None).status_code == 422
    assert world.punch(team.h["alice"], photo=b"this is not an image").status_code == 422
    assert world.punch(team.h["alice"], photo=b"%PDF-1.4 fake").status_code == 422  # PDFs not allowed for attendance
    # client-supplied filename/extension is irrelevant; content is what counts
    assert world.punch(team.h["alice"], photo=JPEG, name="../../evil.php").status_code == 201


def test_event_sequence_rules(world, team):
    world.office()
    h = team.h["alice"]
    assert world.punch(h, "CHECK_OUT").status_code == 409  # nothing to check out of
    assert world.punch(h, "CHECK_IN").status_code == 201
    assert world.punch(h, "CHECK_IN").status_code == 409  # duplicate
    world.set_now(world.now + timedelta(hours=9))
    assert world.punch(h, "CHECK_OUT").status_code == 201
    assert world.punch(h, "CHECK_OUT").status_code == 409  # duplicate
    assert world.client.get(f"{API}/attendance/today", headers=h).json()["state"] == "COMPLETED"


def test_timestamp_comes_from_server_not_client(world, team):
    world.office()
    r = world.client.post(f"{API}/attendance/events", headers=team.h["alice"],
                          data={"event_type": "CHECK_IN", "mode": "OFFICE", "latitude": str(OFFICE[0]),
                                "longitude": str(OFFICE[1]), "occurred_at": "2020-01-01T00:00:00Z"},
                          files={"photo": ("a.jpg", JPEG, "image/jpeg")})
    assert r.status_code == 201
    assert r.json()["event"]["occurred_at"].startswith("2026-10-26")


def test_day_status_present_late_and_hours(world, team):
    world.office()
    h = team.h["alice"]
    world.set_now(datetime(2026, 10, 26, 4, 30, tzinfo=timezone.utc))  # 10:00 IST: 45 min after 09:15 limit
    world.punch(h, "CHECK_IN")
    world.set_now(datetime(2026, 10, 26, 13, 0, tzinfo=timezone.utc))  # 18:30 IST
    world.punch(h, "CHECK_OUT")
    day = world.client.get(f"{API}/attendance/me?from=2026-10-26&to=2026-10-26", headers=h).json()["rows"][0]
    assert day["status"] == "PRESENT"
    assert day["late"] is True and day["late_minutes"] == 45
    assert day["worked_minutes"] == 510


def test_half_day_and_short_day(world, team):
    world.office()
    h = team.h["alice"]
    world.punch(h, "CHECK_IN")
    world.set_now(world.now + timedelta(hours=5))
    world.punch(h, "CHECK_OUT")
    s = world.client.get(f"{API}/attendance/me?from=2026-10-26&to=2026-10-26", headers=h).json()
    assert s["rows"][0]["status"] == "HALF_DAY"


def test_missing_checkout_is_incomplete_not_present(world, team):
    world.office()
    world.punch(team.h["alice"], "CHECK_IN")
    world.set_now(world.now + timedelta(days=1, hours=2))  # next day, 36h later
    day = world.client.get(f"{API}/attendance/me?from=2026-10-26&to=2026-10-26", headers=team.h["alice"]).json()["rows"][0]
    assert day["status"] == "INCOMPLETE"
    inc = world.client.get(f"{API}/attendance/exceptions", headers=team.h["mgr"]).json()["incomplete"]
    assert [r["employee_name"] for r in inc] == ["Alice A"]
    # cannot just check out 36h later
    assert world.punch(team.h["alice"], "CHECK_OUT").status_code == 409


def test_absent_weekly_off_holiday_and_leave_statuses(world, team):
    world.client.post(f"{API}/policies/holidays", headers=team.h["owner"],
                      json={"date": "2026-10-27", "name": "Festival Day"})
    world.set_now(datetime(2026, 10, 28, 4, 0, tzinfo=timezone.utc))
    rows = world.client.get(f"{API}/attendance/me?from=2026-10-25&to=2026-10-28", headers=team.h["alice"]).json()["rows"]
    by = {r["date"]: r["status"] for r in rows}
    assert by["2026-10-25"] == "WEEKLY_OFF"  # Sunday
    assert by["2026-10-26"] == "ABSENT"
    assert by["2026-10-27"] == "HOLIDAY"


def test_photo_privacy(world, team):
    world.office()
    ev_id = world.punch(team.h["alice"]).json()["event"]["id"]
    url = f"{API}/attendance/events/{ev_id}/photo"
    assert world.client.get(url).status_code == 401
    assert world.client.get(url, headers=team.h["alice"]).status_code == 200  # owner of record
    assert world.client.get(url, headers=team.h["mgr"]).status_code == 200  # her manager
    assert world.client.get(url, headers=team.h["hr"]).status_code == 200
    assert world.client.get(url, headers=team.h["bob"]).status_code == 404  # colleague guessing ids
    assert world.client.get(url, headers=team.h["carol"]).status_code == 404
    r = world.client.get(url, headers=team.h["alice"])
    assert "no-store" in r.headers["cache-control"]


def test_register_scope_per_role(world, team):
    world.office()
    for n in ("alice", "bob", "carol"):
        world.punch(team.h[n])
    q = "?from=2026-10-26&to=2026-10-26"
    mgr = {r["employee_name"] for r in world.client.get(f"{API}/attendance{q}", headers=team.h["mgr"]).json()["rows"]}
    assert mgr == {"Alice A", "Bob B"}
    hr = {r["employee_name"] for r in world.client.get(f"{API}/attendance{q}", headers=team.h["hr"]).json()["rows"]}
    assert {"Alice A", "Bob B", "Carol C"} <= hr
    assert world.client.get(f"{API}/attendance{q}", headers=team.h["alice"]).status_code == 403


def test_employee_cannot_read_others_events_by_id(world, team):
    world.office()
    world.punch(team.h["alice"])
    r = world.client.get(f"{API}/attendance/events?attendance_date=2026-10-26&employee_id={team.alice.id}",
                         headers=team.h["bob"])
    assert r.status_code == 404


def test_correction_request_and_approval(world, team):
    world.office()
    h = team.h["alice"]
    world.punch(h, "CHECK_IN")
    world.set_now(world.now + timedelta(days=1))  # forgot to check out
    body = {"attendance_date": "2026-10-26", "requested_check_out": "2026-10-26T18:30:00+05:30",
            "reason": "Forgot to check out"}
    r = world.client.post(f"{API}/attendance/corrections", headers=h, json=body)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert world.client.post(f"{API}/attendance/corrections", headers=h, json=body).status_code == 409  # duplicate pending
    # employee cannot approve own; another manager's team cannot either
    assert world.client.post(f"{API}/attendance/corrections/{cid}/review", headers=h,
                             json={"decision": "APPROVED"}).status_code == 403
    assert world.client.post(f"{API}/attendance/corrections/{cid}/review", headers=team.h["carol"],
                             json={"decision": "APPROVED"}).status_code in (403, 404)
    assert world.client.post(f"{API}/attendance/corrections/{cid}/review", headers=team.h["mgr"],
                             json={"decision": "REJECTED"}).status_code == 422  # reason required
    ok = world.client.post(f"{API}/attendance/corrections/{cid}/review", headers=team.h["mgr"],
                           json={"decision": "APPROVED", "reason": "Verified"})
    assert ok.status_code == 200 and ok.json()["status"] == "APPROVED"
    day = world.client.get(f"{API}/attendance/me?from=2026-10-26&to=2026-10-26", headers=h).json()["rows"][0]
    assert day["status"] == "PRESENT" and day["corrected"] is True
    # decided twice -> conflict
    assert world.client.post(f"{API}/attendance/corrections/{cid}/review", headers=team.h["mgr"],
                             json={"decision": "APPROVED"}).status_code == 409
    # original event row is untouched
    evs = world.client.get(f"{API}/attendance/events?attendance_date=2026-10-26", headers=h).json()
    assert [e["event_type"] for e in evs] == ["CHECK_IN"]


def test_correction_validation(world, team):
    h = team.h["alice"]
    base = {"attendance_date": "2026-10-26", "reason": "Because"}
    assert world.client.post(f"{API}/attendance/corrections", headers=h, json=base).status_code == 422  # nothing to change
    assert world.client.post(f"{API}/attendance/corrections", headers=h, json={
        **base, "attendance_date": "2026-12-01", "requested_status": "PRESENT"}).status_code == 422  # future
    assert world.client.post(f"{API}/attendance/corrections", headers=h, json={
        **base, "attendance_date": "2026-08-01", "requested_status": "PRESENT"}).status_code == 422  # outside 30-day window
    assert world.client.post(f"{API}/attendance/corrections", headers=h, json={
        **base, "requested_check_in": "2026-10-26T18:00:00+05:30",
        "requested_check_out": "2026-10-26T09:00:00+05:30"}).status_code == 422


def test_hr_direct_correction_is_audited(world, team):
    r = world.client.post(f"{API}/attendance/corrections", headers=team.h["hr"], json={
        "employee_id": team.alice.id, "attendance_date": "2026-10-26", "requested_status": "PRESENT",
        "reason": "Machine outage, verified by supervisor"})
    assert r.status_code == 201 and r.json()["status"] == "APPROVED" and r.json()["is_direct"] is True
    assert world.client.post(f"{API}/attendance/corrections", headers=team.h["alice"], json={
        "employee_id": team.bob.id, "attendance_date": "2026-10-26", "requested_status": "PRESENT",
        "reason": "I am not HR"}).status_code == 403
    logs = world.client.get(f"{API}/audit-logs?action=ATTENDANCE_CORRECTED", headers=team.h["owner"]).json()
    assert logs["total"] == 1


def test_notification_sent_to_manager_on_flag(world, team):
    world.office()
    world.punch(team.h["alice"], lat=OFFICE[0] + 0.01)
    n = world.client.get(f"{API}/notifications", headers=team.h["mgr"]).json()
    assert n["unread"] == 1 and "review" in n["items"][0]["title"].lower()
