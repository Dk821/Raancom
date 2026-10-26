from sqlalchemy import func, select

from app.core.enums import Role
from app.models.leave_balance import LeaveBalance
from app.models.leave_ledger import LeaveLedger
from app.services import leave_service

API = "/api/v1"


def tid(world, headers, code):
    return {t["code"]: t["id"] for t in world.client.get(f"{API}/leave/types", headers=headers).json()}[code]


def apply(world, h, code, start, end, half=False, session=None, reason="Family function"):
    data = {"leave_type_id": str(tid(world, h, code)), "start_date": start, "end_date": end, "reason": reason}
    if half:
        data["is_half_day"] = "true"
        data["half_day_session"] = session or "FIRST_HALF"
    return world.client.post(f"{API}/leave/requests", data=data, headers=h)


def decide(world, h, rid, decision, comments=None):
    return world.client.post(f"{API}/leave/requests/{rid}/decisions", headers=h,
                             json={"decision": decision, "comments": comments})


def balance(world, h, code="CL"):
    b = world.client.get(f"{API}/leave/balances/me", headers=h).json()["balances"]
    return next(x for x in b if x["code"] == code)


def assert_ledger_matches_cache(db):
    """The cached balance must always equal the sum of the append-only ledger."""
    db.expire_all()
    for bal in db.scalars(select(LeaveBalance)):
        total = db.scalar(select(func.coalesce(func.sum(LeaveLedger.days), 0)).where(
            LeaveLedger.employee_id == bal.employee_id, LeaveLedger.leave_type_id == bal.leave_type_id,
            LeaveLedger.year == bal.year))
        assert abs(float(total) - float(bal.balance)) < 1e-9, (bal.employee_id, bal.leave_type_id, total, bal.balance)


def test_initial_balances_from_defaults(world, team):
    assert balance(world, team.h["alice"], "CL")["balance"] == 12
    assert balance(world, team.h["alice"], "SL")["balance"] == 6


def test_apply_approve_debits_ledger_once(world, team, db):
    h = team.h["alice"]
    r = apply(world, h, "CL", "2026-10-28", "2026-10-29")
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["status"] == "PENDING_MANAGER" and req["days"] == 2
    b = balance(world, h)
    assert b["balance"] == 12 and b["pending"] == 2 and b["available"] == 10  # reserved but not debited yet
    ok = decide(world, team.h["mgr"], req["id"], "APPROVE", "Enjoy")
    assert ok.status_code == 200 and ok.json()["status"] == "APPROVED"
    b = balance(world, h)
    assert b["balance"] == 10 and b["used"] == 2 and b["pending"] == 0
    # double approval is a conflict and does not double-deduct
    assert decide(world, team.h["mgr"], req["id"], "APPROVE").status_code == 409
    assert decide(world, team.h["owner"], req["id"], "APPROVE").status_code == 409
    assert balance(world, h)["balance"] == 10
    assert_ledger_matches_cache(db)
    n = world.client.get(f"{API}/notifications", headers=h).json()
    assert any("approved" in i["title"].lower() for i in n["items"])


def test_cancel_approved_leave_reverses_via_ledger(world, team, db):
    h = team.h["alice"]
    rid = apply(world, h, "CL", "2026-10-28", "2026-10-29").json()["id"]
    decide(world, team.h["mgr"], rid, "APPROVE")
    c = world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=h, json={"reason": "Plans changed"})
    assert c.json()["status"] == "CANCELLATION_REQUESTED"
    assert balance(world, h)["balance"] == 10  # still debited until approved
    assert decide(world, h, rid, "APPROVE").status_code == 403  # cannot approve own cancellation
    done = decide(world, team.h["mgr"], rid, "APPROVE")
    assert done.json()["status"] == "CANCELLED"
    assert balance(world, h)["balance"] == 12
    types = [l["txn_type"] for l in world.client.get(f"{API}/leave/ledger/{team.alice.id}", headers=h).json()]
    assert {"ALLOCATION", "DEBIT", "REVERSAL"} <= set(types)  # nothing erased
    assert_ledger_matches_cache(db)
    # cancelling again is refused and does not reverse twice
    assert world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=h, json={}).status_code == 409
    assert balance(world, h)["balance"] == 12


def test_cancellation_rejected_keeps_leave(world, team):
    h = team.h["alice"]
    rid = apply(world, h, "CL", "2026-10-28", "2026-10-28").json()["id"]
    decide(world, team.h["mgr"], rid, "APPROVE")
    world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=h, json={})
    assert decide(world, team.h["mgr"], rid, "REJECT").status_code == 422  # reason needed
    r = decide(world, team.h["mgr"], rid, "REJECT", "Team is short-staffed")
    assert r.json()["status"] == "APPROVED"
    assert balance(world, h)["balance"] == 11


def test_cancel_without_approval_when_policy_allows(world, team):
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"], json={"approved_leave_cancel_needs_approval": False})
    h = team.h["alice"]
    rid = apply(world, h, "CL", "2026-10-28", "2026-10-28").json()["id"]
    decide(world, team.h["mgr"], rid, "APPROVE")
    assert world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=h, json={}).json()["status"] == "CANCELLED"
    assert balance(world, h)["balance"] == 12


def test_withdraw_pending_request(world, team):
    h = team.h["alice"]
    rid = apply(world, h, "CL", "2026-10-28", "2026-10-28").json()["id"]
    assert world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=team.h["bob"], json={}).status_code == 404
    assert world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=h, json={}).json()["status"] == "CANCELLED"
    assert balance(world, h)["pending"] == 0


def test_weekly_off_and_holidays_not_charged(world, team):
    h = team.h["alice"]
    t = tid(world, h, "CL")
    q = {"leave_type_id": t, "start_date": "2026-10-30", "end_date": "2026-11-02"}  # Fri, Sat, Sun(off), Mon
    assert world.client.post(f"{API}/leave/estimate", headers=h, json=q).json()["days"] == 3
    world.client.post(f"{API}/policies/holidays", headers=team.h["owner"], json={"date": "2026-11-02", "name": "Holiday"})
    assert world.client.post(f"{API}/leave/estimate", headers=h, json=q).json()["days"] == 2
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"],
                     json={"weekends_count_as_leave": True, "holidays_count_as_leave": True})
    assert world.client.post(f"{API}/leave/estimate", headers=h, json=q).json()["days"] == 4
    only_off = {"leave_type_id": t, "start_date": "2026-11-08", "end_date": "2026-11-08"}
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"],
                     json={"weekends_count_as_leave": False})
    r = world.client.post(f"{API}/leave/estimate", headers=h, json=only_off).json()
    assert r["ok"] is False and "no chargeable" in r["error"].lower()


def test_insufficient_balance_blocked_and_pending_is_reserved(world, team):
    h = team.h["alice"]
    r = apply(world, h, "SL", "2026-11-09", "2026-11-17")  # 8 chargeable days vs 6
    assert r.status_code == 422 and "Insufficient" in r.json()["detail"]
    assert apply(world, h, "SL", "2026-11-09", "2026-11-12").status_code == 201  # 4 of 6
    assert apply(world, h, "SL", "2026-11-16", "2026-11-18").status_code == 422  # only 2 left after pending


def test_balance_rechecked_at_approval(world, team, db):
    """Two pending requests that individually fit must not both be approved."""
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"], json={"insufficient_balance_action": "ALLOW"})
    h = team.h["alice"]
    a = apply(world, h, "SL", "2026-11-09", "2026-11-12").json()["id"]
    b = apply(world, h, "SL", "2026-11-16", "2026-11-19").json()["id"]
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"], json={"insufficient_balance_action": "BLOCK"})
    assert decide(world, team.h["mgr"], a, "APPROVE").status_code == 200
    r = decide(world, team.h["mgr"], b, "APPROVE")
    assert r.status_code == 422 and "Insufficient" in r.json()["detail"]
    assert balance(world, h, "SL")["balance"] == 2
    assert_ledger_matches_cache(db)


def test_overlap_rules_and_half_days(world, team):
    h = team.h["alice"]
    assert apply(world, h, "CL", "2026-10-28", "2026-10-29").status_code == 201
    assert apply(world, h, "CL", "2026-10-29", "2026-10-30").status_code == 409
    assert apply(world, h, "SL", "2026-10-29", "2026-10-29", half=True).status_code == 409
    assert apply(world, h, "CL", "2026-11-04", "2026-11-04", half=True, session="FIRST_HALF").status_code == 201
    assert apply(world, h, "CL", "2026-11-04", "2026-11-04", half=True, session="SECOND_HALF").status_code == 201
    assert apply(world, h, "SL", "2026-11-04", "2026-11-04", half=True, session="FIRST_HALF").status_code == 409
    assert apply(world, h, "CL", "2026-11-05", "2026-11-06", half=True).status_code == 422  # half day must be one date
    assert balance(world, h)["pending"] == 3


def test_half_day_charges_half(world, team):
    h = team.h["alice"]
    rid = apply(world, h, "CL", "2026-10-28", "2026-10-28", half=True, session="SECOND_HALF").json()["id"]
    decide(world, team.h["mgr"], rid, "APPROVE")
    assert balance(world, h)["balance"] == 11.5


def test_backdated_limits(world, team):
    h = team.h["alice"]
    assert apply(world, h, "CL", "2026-10-10", "2026-10-10").status_code == 422  # > 7 days back
    assert apply(world, h, "CL", "2026-10-22", "2026-10-22").status_code == 201
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"], json={"allow_backdated_leave": False})
    assert apply(world, h, "CL", "2026-10-21", "2026-10-21").status_code == 422


def test_validation_errors(world, team):
    h = team.h["alice"]
    assert apply(world, h, "CL", "2026-10-30", "2026-10-28").status_code == 422  # end before start
    assert apply(world, h, "CL", "2024-12-30", "2024-12-31").status_code == 422  # before joining + backdate
    assert world.client.post(f"{API}/leave/requests", headers=h, data={
        "leave_type_id": "9999", "start_date": "2026-10-28", "end_date": "2026-10-28", "reason": "xx yy"}).status_code == 422


def test_cannot_approve_own_request(world, team):
    # Alice (employee) has no approval rights at all
    rid = apply(world, team.h["alice"], "CL", "2026-10-28", "2026-10-28").json()["id"]
    assert decide(world, team.h["alice"], rid, "APPROVE").status_code == 403
    # a manager's own request goes to *their* manager, never to themselves
    rid2 = apply(world, team.h["mgr"], "CL", "2026-10-28", "2026-10-28").json()["id"]
    assert decide(world, team.h["mgr"], rid2, "APPROVE").status_code == 403
    assert decide(world, team.h["owner"], rid2, "APPROVE").status_code == 200
    # HR cannot approve their own, owner (their manager) can
    rid3 = apply(world, team.h["hr"], "CL", "2026-10-28", "2026-10-28").json()["id"]
    assert decide(world, team.h["hr"], rid3, "APPROVE").status_code == 403


def test_only_assigned_manager_can_decide(world, team):
    other = world.make(Role.REPORTING_MANAGER, "mgr2@example.com", "Other Manager", manager=team.owner)
    h2 = world.login("mgr2@example.com")
    rid = apply(world, team.h["alice"], "CL", "2026-10-28", "2026-10-28").json()["id"]
    assert decide(world, h2, rid, "APPROVE").status_code == 404  # not even visible
    assert world.client.get(f"{API}/leave/requests/{rid}", headers=h2).status_code == 404
    assert decide(world, team.h["bob"], rid, "APPROVE").status_code == 404  # colleague
    # HR may not decide at the manager step; Owner may override
    assert decide(world, team.h["hr"], rid, "APPROVE").status_code == 403
    assert decide(world, team.h["owner"], rid, "APPROVE").status_code == 200
    hist = world.client.get(f"{API}/leave/requests/{rid}", headers=team.h["alice"]).json()["history"]
    assert [x["step"] for x in hist] == ["EMPLOYEE", "OWNER"]


def test_employee_without_manager_goes_to_hr(world, team):
    rid = apply(world, team.h["carol"], "CL", "2026-10-28", "2026-10-28").json()
    assert rid["status"] == "PENDING_HR"
    assert decide(world, team.h["mgr"], rid["id"], "APPROVE").status_code == 404
    assert decide(world, team.h["hr"], rid["id"], "APPROVE").json()["status"] == "APPROVED"


def test_hr_second_level_when_configured(world, team, db):
    world.client.put(f"{API}/policies/settings", headers=team.h["owner"], json={"hr_second_level_leave": True})
    rid = apply(world, team.h["alice"], "CL", "2026-10-28", "2026-10-29").json()["id"]
    r = decide(world, team.h["mgr"], rid, "APPROVE", "OK from me")
    assert r.json()["status"] == "PENDING_HR"
    assert balance(world, team.h["alice"])["balance"] == 12  # not debited yet
    assert decide(world, team.h["mgr"], rid, "APPROVE").status_code == 403  # manager step is over
    assert decide(world, team.h["hr"], rid, "APPROVE").json()["status"] == "APPROVED"
    assert balance(world, team.h["alice"])["balance"] == 10
    hist = world.client.get(f"{API}/leave/requests/{rid}", headers=team.h["alice"]).json()["history"]
    assert [(x["step"], x["action"]) for x in hist] == [("EMPLOYEE", "SUBMITTED"), ("MANAGER", "APPROVED"), ("HR", "APPROVED")]
    assert_ledger_matches_cache(db)


def test_reject_and_return_flow_with_history(world, team):
    h = team.h["alice"]
    rid = apply(world, h, "CL", "2026-10-28", "2026-10-29").json()["id"]
    assert decide(world, team.h["mgr"], rid, "REJECT").status_code == 422
    assert decide(world, team.h["mgr"], rid, "RETURN", "Please shorten the range").json()["status"] == "NEEDS_CHANGES"
    body = {"leave_type_id": tid(world, h, "CL"), "start_date": "2026-10-28", "end_date": "2026-10-28",
            "reason": "Shortened to one day"}
    assert world.client.patch(f"{API}/leave/requests/{rid}", headers=team.h["bob"], json=body).status_code == 404
    r = world.client.patch(f"{API}/leave/requests/{rid}", headers=h, json=body)
    assert r.status_code == 200 and r.json()["status"] == "PENDING_MANAGER" and r.json()["days"] == 1
    assert decide(world, team.h["mgr"], rid, "REJECT", "Not possible this week").json()["status"] == "REJECTED"
    assert balance(world, h)["balance"] == 12
    detail = world.client.get(f"{API}/leave/requests/{rid}", headers=h).json()
    assert [x["action"] for x in detail["history"]] == ["SUBMITTED", "RETURNED", "RESUBMITTED", "REJECTED"]
    assert detail["history"][-1]["comments"] == "Not possible this week"
    # a rejected request can no longer be edited, decided or cancelled
    assert world.client.patch(f"{API}/leave/requests/{rid}", headers=h, json=body).status_code == 409
    assert decide(world, team.h["mgr"], rid, "APPROVE").status_code == 409


def test_request_visibility_and_listing_scope(world, team):
    rid = apply(world, team.h["alice"], "CL", "2026-10-28", "2026-10-28").json()["id"]
    apply(world, team.h["carol"], "CL", "2026-10-28", "2026-10-28")
    assert world.client.get(f"{API}/leave/requests/{rid}", headers=team.h["bob"]).status_code == 404
    assert world.client.get(f"{API}/leave/requests?scope=team", headers=team.h["bob"]).status_code == 403
    mine = world.client.get(f"{API}/leave/requests", headers=team.h["alice"]).json()
    assert mine["total"] == 1
    mgr_pending = world.client.get(f"{API}/leave/requests?scope=pending", headers=team.h["mgr"]).json()
    assert [i["employee"]["full_name"] for i in mgr_pending["items"]] == ["Alice A"]
    hr_pending = world.client.get(f"{API}/leave/requests?scope=pending", headers=team.h["hr"]).json()
    assert [i["employee"]["full_name"] for i in hr_pending["items"]] == ["Carol C"]
    hr_team = world.client.get(f"{API}/leave/requests?scope=team", headers=team.h["hr"]).json()
    assert hr_team["total"] == 2
    assert world.client.get(f"{API}/leave/balances/{team.carol.id}", headers=team.h["mgr"]).status_code == 404
    assert world.client.get(f"{API}/leave/balances/{team.alice.id}", headers=team.h["mgr"]).status_code == 200


def test_unpaid_leave_has_no_balance_effect(world, team, db):
    h = team.h["alice"]
    rid = apply(world, h, "LOP", "2026-10-28", "2026-10-30").json()["id"]
    assert decide(world, team.h["mgr"], rid, "APPROVE").json()["status"] == "APPROVED"
    assert balance(world, h, "CL")["balance"] == 12
    assert db.scalar(select(func.count(LeaveLedger.id)).where(LeaveLedger.txn_type == "DEBIT")) == 0


def test_admin_cancel_requires_reason_and_reverses(world, team):
    h = team.h["alice"]
    rid = apply(world, h, "CL", "2026-10-28", "2026-10-28").json()["id"]
    decide(world, team.h["mgr"], rid, "APPROVE")
    assert world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=team.h["mgr"], json={"reason": "x"}).status_code == 403
    assert world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=team.h["hr"], json={}).status_code == 422
    r = world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=team.h["hr"], json={"reason": "Client emergency"})
    assert r.json()["status"] == "CANCELLED" and balance(world, h)["balance"] == 12


def test_adjustments_and_rollover(world, team, db):
    body = {"employee_id": team.alice.id, "leave_type_id": tid(world, team.h["hr"], "CL"), "days": 1.5, "note": "Bonus day"}
    assert world.client.post(f"{API}/leave/adjustments", headers=team.h["alice"], json=body).status_code == 403
    assert world.client.post(f"{API}/leave/adjustments", headers=team.h["mgr"], json=body).status_code == 403
    assert world.client.post(f"{API}/leave/adjustments", headers=team.h["hr"], json=body).status_code == 201
    assert balance(world, team.h["alice"])["balance"] == 13.5
    own = {**body, "employee_id": team.hr.id}
    assert world.client.post(f"{API}/leave/adjustments", headers=team.h["hr"], json=own).status_code == 403
    assert world.client.post(f"{API}/leave/adjustments", headers=team.h["hr"], json={**body, "days": 0.3}).status_code == 422

    # carry-forward cap + idempotent rollover
    world.client.patch(f"{API}/policies/leave-types/{body['leave_type_id']}", headers=team.h["owner"],
                       json={"carry_forward_max": 5})
    assert world.client.post(f"{API}/leave/rollover", headers=team.h["hr"], json={"year": 2027}).status_code == 403
    r1 = world.client.post(f"{API}/leave/rollover", headers=team.h["owner"], json={"year": 2027}).json()
    r2 = world.client.post(f"{API}/leave/rollover", headers=team.h["owner"], json={"year": 2027}).json()
    assert r1["allocation_entries"] > 0 and r2 == {"year": 2027, "carry_forward_entries": 0, "allocation_entries": 0}
    b27 = world.client.get(f"{API}/leave/balances/me?year=2027", headers=team.h["alice"]).json()["balances"]
    assert next(x for x in b27 if x["code"] == "CL")["balance"] == 17  # 12 + min(13.5, 5)
    assert_ledger_matches_cache(db)


def test_ledger_functions_are_consistent_under_repeated_operations(world, team, db):
    h = team.h["alice"]
    for day in ("2026-10-28", "2026-10-29", "2026-10-30"):
        rid = apply(world, h, "CL", day, day).json()["id"]
        decide(world, team.h["mgr"], rid, "APPROVE")
        world.client.post(f"{API}/leave/requests/{rid}/cancel", headers=h, json={})
        decide(world, team.h["mgr"], rid, "APPROVE")
    assert balance(world, h)["balance"] == 12
    assert_ledger_matches_cache(db)
    assert leave_service.read_balance(db, team.alice.id, tid(world, h, "CL"), 2026) == 12


def test_calendar_scope(world, team):
    apply(world, team.h["alice"], "CL", "2026-10-28", "2026-10-28")
    apply(world, team.h["carol"], "CL", "2026-10-28", "2026-10-28")
    as_bob = world.client.get(f"{API}/leave/calendar?month=2026-10", headers=team.h["bob"]).json()
    assert as_bob["leaves"] == []
    as_mgr = world.client.get(f"{API}/leave/calendar?month=2026-10", headers=team.h["mgr"]).json()
    assert [l["employee_name"] for l in as_mgr["leaves"]] == ["Alice A"]
    as_hr = world.client.get(f"{API}/leave/calendar?month=2026-10", headers=team.h["hr"]).json()
    assert len(as_hr["leaves"]) == 2


def test_attachment_required_and_private(world, team):
    world.client.patch(f"{API}/policies/leave-types/{tid(world, team.h['owner'], 'SL')}", headers=team.h["owner"],
                       json={"requires_attachment": True})
    h = team.h["alice"]
    base = {"leave_type_id": str(tid(world, h, "SL")), "start_date": "2026-10-28", "end_date": "2026-10-28", "reason": "Fever"}
    assert world.client.post(f"{API}/leave/requests", headers=h, data=base).status_code == 422
    bad = world.client.post(f"{API}/leave/requests", headers=h, data=base, files={"attachment": ("n.pdf", b"not a pdf", "application/pdf")})
    assert bad.status_code == 422
    ok = world.client.post(f"{API}/leave/requests", headers=h, data=base,
                           files={"attachment": ("note.pdf", b"%PDF-1.4 medical note", "application/pdf")})
    assert ok.status_code == 201 and ok.json()["has_attachment"] is True
    rid = ok.json()["id"]
    url = f"{API}/leave/requests/{rid}/attachment"
    assert world.client.get(url).status_code == 401
    assert world.client.get(url, headers=team.h["bob"]).status_code == 404
    assert world.client.get(url, headers=team.h["mgr"]).status_code == 200
