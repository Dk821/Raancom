"""Leave approval state machine. Every transition runs in one transaction, takes a row
lock on the request, writes an immutable history row and (where relevant) ledger rows."""
from datetime import date

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.enums import LeaveStatus, LedgerType, Role
from app.core.permissions import Principal, can_view_employee
from app.models.company_setting import CompanySetting
from app.models.employee import Employee
from app.models.leave_approval import LeaveApproval
from app.models.leave_request import LeaveRequest
from app.models.leave_type import LeaveType
from app.services import audit_service, leave_service, notification_service
from app.services.leave_service import REF_REQUEST
from app.services.settings_service import get_settings

S = LeaveStatus


# ------------------------------------------------------------------ helpers
def first_step(employee: Employee) -> str:
    return S.PENDING_MANAGER.value if employee.manager_id else S.PENDING_HR.value


def _history(db: Session, req: LeaveRequest, step: str, action: str, actor_user_id: int, comments: str | None = None):
    db.add(LeaveApproval(request_id=req.id, step=step, action=action, actor_user_id=actor_user_id, comments=comments))


def _approver_user_ids(db: Session, req: LeaveRequest) -> list[int]:
    emp = req.employee
    ids: list[int] = []
    if req.status == S.PENDING_MANAGER.value and emp.manager_id:
        mgr = db.get(Employee, emp.manager_id)
        if mgr:
            ids.append(mgr.user_id)
    elif req.status == S.CANCELLATION_REQUESTED.value and emp.manager_id:
        mgr = db.get(Employee, emp.manager_id)
        if mgr:
            ids.append(mgr.user_id)
    if not ids:
        ids = notification_service.user_ids_with_roles(db, (Role.HR, Role.OWNER))
    return [i for i in ids if i != emp.user_id]


def _notify_approvers(db: Session, req: LeaveRequest, title: str) -> None:
    notification_service.notify_many(
        db, _approver_user_ids(db, req), title,
        f"{req.employee.full_name}: {req.start_date} to {req.end_date} ({req.days:g} day(s))", "/leave/approvals",
    )


def _notify_employee(db: Session, req: LeaveRequest, title: str, body: str | None = None) -> None:
    notification_service.notify(db, req.employee.user_id, title, body, "/leave")


def decider_step(p: Principal, req: LeaveRequest) -> str | None:
    """Which approval step the principal would act as for this request right now, or None."""
    emp = req.employee
    if emp.id == p.employee.id:
        return None  # nobody approves their own request
    is_direct_manager = emp.manager_id == p.employee.id
    if req.status == S.PENDING_MANAGER.value:
        if is_direct_manager:
            return "MANAGER"
        if p.role == Role.OWNER.value:
            return "OWNER"
    elif req.status == S.PENDING_HR.value:
        if p.role == Role.HR.value:
            return "HR"
        if p.role == Role.OWNER.value:
            return "OWNER"
    elif req.status == S.CANCELLATION_REQUESTED.value:
        if is_direct_manager:
            return "MANAGER"
        if p.role == Role.HR.value:
            return "HR"
        if p.role == Role.OWNER.value:
            return "OWNER"
    return None


def can_view_request(p: Principal, req: LeaveRequest) -> bool:
    return can_view_employee(p, req.employee)


def load_locked(db: Session, request_id: int) -> LeaveRequest:
    req = db.scalar(select(LeaveRequest).where(LeaveRequest.id == request_id).with_for_update())
    if req is None:
        raise HTTPException(404, "Leave request not found")
    return req


def load_for_view(db: Session, p: Principal, request_id: int, lock: bool = False) -> LeaveRequest:
    req = load_locked(db, request_id) if lock else db.get(LeaveRequest, request_id)
    if req is None or not can_view_request(p, req):
        raise HTTPException(404, "Leave request not found")
    return req


def pending_for_me_clause(p: Principal):
    """SQL filter: requests this principal can decide right now."""
    not_mine = LeaveRequest.employee_id != p.employee.id
    reports = Employee.manager_id == p.employee.id
    clauses = []
    if p.role in (Role.OWNER.value, Role.HR.value, Role.REPORTING_MANAGER.value):
        clauses.append(and_(LeaveRequest.status.in_([S.PENDING_MANAGER.value, S.CANCELLATION_REQUESTED.value]), reports))
    if p.role == Role.OWNER.value:
        clauses.append(LeaveRequest.status.in_([S.PENDING_MANAGER.value, S.PENDING_HR.value, S.CANCELLATION_REQUESTED.value]))
    if p.role == Role.HR.value:
        clauses.append(LeaveRequest.status.in_([S.PENDING_HR.value, S.CANCELLATION_REQUESTED.value]))
    if not clauses:
        return LeaveRequest.id == -1
    return and_(not_mine, or_(*clauses))


# --------------------------------------------------------------- transitions
def submit(
    db: Session, p: Principal, leave_type: LeaveType, start: date, end: date, is_half: bool,
    half_session: str | None, reason: str, attachment_key: str | None,
) -> LeaveRequest:
    settings = get_settings(db)
    emp = p.employee
    if leave_type.requires_attachment and not attachment_key:
        raise HTTPException(422, f"{leave_type.name} requires a supporting document")
    check = leave_service.validate_request(db, settings, emp, leave_type, start, end, is_half, half_session)
    req = LeaveRequest(
        employee_id=emp.id, leave_type_id=leave_type.id, start_date=start, end_date=end, is_half_day=is_half,
        half_day_session=half_session if is_half else None, days=check.days, reason=reason.strip(),
        attachment_key=attachment_key, status=first_step(emp),
    )
    db.add(req)
    db.flush()
    _history(db, req, "EMPLOYEE", "SUBMITTED", p.user.id, reason.strip())
    audit_service.log(db, p.user, "LEAVE_SUBMITTED", "leave_request", req.id,
                      {"type": leave_type.code, "start": start, "end": end, "days": check.days})
    _notify_approvers(db, req, "New leave request awaiting your decision")
    return req


def edit(
    db: Session, p: Principal, req: LeaveRequest, leave_type: LeaveType, start: date, end: date, is_half: bool,
    half_session: str | None, reason: str,
) -> LeaveRequest:
    if req.employee_id != p.employee.id:
        raise HTTPException(403, "Only the requester can edit this request")
    if req.status not in (S.PENDING_MANAGER.value, S.PENDING_HR.value, S.NEEDS_CHANGES.value):
        raise HTTPException(409, "Only pending requests can be edited")
    settings = get_settings(db)
    if leave_type.requires_attachment and not req.attachment_key:
        raise HTTPException(422, f"{leave_type.name} requires a supporting document")
    check = leave_service.validate_request(db, settings, p.employee, leave_type, start, end, is_half, half_session, req.id)
    resubmitted = req.status == S.NEEDS_CHANGES.value
    req.leave_type_id = leave_type.id
    req.start_date, req.end_date = start, end
    req.is_half_day = is_half
    req.half_day_session = half_session if is_half else None
    req.days = check.days
    req.reason = reason.strip()
    req.status = first_step(p.employee)
    _history(db, req, "EMPLOYEE", "RESUBMITTED" if resubmitted else "EDITED", p.user.id, reason.strip())
    audit_service.log(db, p.user, "LEAVE_RESUBMITTED" if resubmitted else "LEAVE_EDITED", "leave_request", req.id,
                      {"start": start, "end": end, "days": check.days})
    db.flush()
    _notify_approvers(db, req, "Leave request updated and awaiting your decision")
    return req


def _finalize_approval(db: Session, settings: CompanySetting, req: LeaveRequest, actor_user_id: int) -> None:
    """Debit the ledger and mark approved. Caller holds the request row lock."""
    lt = req.leave_type
    by_year = leave_service.days_by_year(db, settings, req.start_date, req.end_date, req.is_half_day)
    total = round(sum(by_year.values()), 2)
    if total <= 0:
        raise HTTPException(422, "No chargeable days remain for this request (policy or holiday calendar changed); reject it instead")
    if lt.balance_required:
        for year, need in sorted(by_year.items()):
            bal = leave_service.get_or_create_balance(db, req.employee_id, lt.id, year, lock=True)
            if float(bal.balance) + 1e-9 < need and settings.insufficient_balance_action == "BLOCK":
                raise HTTPException(
                    422, f"Insufficient {lt.code} balance for {year}: need {need:g}, balance {float(bal.balance):g}"
                )
            leave_service.post_ledger(
                db, req.employee_id, lt.id, year, LedgerType.DEBIT, -need, REF_REQUEST, req.id,
                f"Leave {req.start_date} to {req.end_date}", actor_user_id,
            )
    req.days = total
    req.status = S.APPROVED.value
    req.decided_at = clock.now_utc()


def decide(db: Session, p: Principal, request_id: int, decision: str, comments: str | None) -> LeaveRequest:
    decision = decision.upper()
    if decision not in ("APPROVE", "REJECT", "RETURN"):
        raise HTTPException(422, "Decision must be APPROVE, REJECT or RETURN")
    comments = (comments or "").strip() or None
    req = load_for_view(db, p, request_id, lock=True)
    decidable = (S.PENDING_MANAGER.value, S.PENDING_HR.value, S.CANCELLATION_REQUESTED.value)
    if req.status not in decidable:
        raise HTTPException(409, f"Request is {req.status} and is not awaiting a decision")
    step = decider_step(p, req)
    if step is None:
        raise HTTPException(403, "You are not allowed to decide this request")
    settings = get_settings(db)

    # ---- cancellation of an approved leave
    if req.status == S.CANCELLATION_REQUESTED.value:
        if decision == "RETURN":
            raise HTTPException(422, "A cancellation request can only be approved or rejected")
        if decision == "REJECT" and not comments:
            raise HTTPException(422, "Please give a reason when rejecting")
        if decision == "APPROVE":
            leave_service.reverse_debits(db, req.id, p.user.id, "Cancellation approved")
            req.status = S.CANCELLED.value
            action, title = "CANCEL_APPROVED", "Your leave cancellation was approved"
        else:
            req.status = S.APPROVED.value
            action, title = "CANCEL_REJECTED", "Your leave cancellation was rejected"
        req.decided_at = clock.now_utc()
        _history(db, req, "CANCELLATION", action, p.user.id, comments)
        audit_service.log(db, p.user, f"LEAVE_{action}", "leave_request", req.id, {"step": step})
        _notify_employee(db, req, title, comments)
        db.flush()
        return req

    # ---- normal approval chain
    if decision in ("REJECT", "RETURN") and not comments:
        raise HTTPException(422, "Please add a comment when rejecting or returning a request")

    if decision == "REJECT":
        req.status = S.REJECTED.value
        req.decided_at = clock.now_utc()
        action, title = "REJECTED", "Your leave request was rejected"
    elif decision == "RETURN":
        req.status = S.NEEDS_CHANGES.value
        action, title = "RETURNED", "Your leave request was returned for changes"
    else:
        go_to_hr = req.status == S.PENDING_MANAGER.value and step == "MANAGER" and settings.hr_second_level_leave
        if go_to_hr:
            req.status = S.PENDING_HR.value
            action, title = "APPROVED", "Your leave request passed manager approval"
        else:
            _finalize_approval(db, settings, req, p.user.id)
            action, title = "APPROVED", "Your leave request was approved"
    _history(db, req, step, action, p.user.id, comments)
    audit_service.log(db, p.user, f"LEAVE_{action}", "leave_request", req.id,
                      {"step": step, "status": req.status, "days": req.days})
    _notify_employee(db, req, title, comments)
    db.flush()
    if req.status == S.PENDING_HR.value:
        _notify_approvers(db, req, "Leave request awaiting HR review")
    return req


def cancel(db: Session, p: Principal, request_id: int, reason: str | None) -> LeaveRequest:
    reason = (reason or "").strip() or None
    req = load_for_view(db, p, request_id, lock=True)
    settings = get_settings(db)
    is_owner = req.employee_id == p.employee.id

    if req.status in (S.PENDING_MANAGER.value, S.PENDING_HR.value, S.NEEDS_CHANGES.value):
        if not is_owner:
            raise HTTPException(403, "Only the requester can withdraw a pending request")
        req.status = S.CANCELLED.value
        req.decided_at = clock.now_utc()
        _history(db, req, "EMPLOYEE", "CANCELLED", p.user.id, reason)
        audit_service.log(db, p.user, "LEAVE_CANCELLED", "leave_request", req.id)
    elif req.status == S.APPROVED.value:
        if is_owner:
            if settings.approved_leave_cancel_needs_approval:
                req.status = S.CANCELLATION_REQUESTED.value
                _history(db, req, "EMPLOYEE", "CANCEL_REQUESTED", p.user.id, reason)
                audit_service.log(db, p.user, "LEAVE_CANCEL_REQUESTED", "leave_request", req.id)
                db.flush()
                _notify_approvers(db, req, "Leave cancellation awaiting your decision")
                return req
            leave_service.reverse_debits(db, req.id, p.user.id, "Cancelled by employee")
            req.status = S.CANCELLED.value
            req.decided_at = clock.now_utc()
            _history(db, req, "EMPLOYEE", "CANCELLED", p.user.id, reason)
            audit_service.log(db, p.user, "LEAVE_CANCELLED", "leave_request", req.id)
        elif p.role in (Role.HR.value, Role.OWNER.value):
            if not reason:
                raise HTTPException(422, "A reason is required to cancel someone's approved leave")
            leave_service.reverse_debits(db, req.id, p.user.id, "Cancelled by admin")
            req.status = S.CANCELLED.value
            req.decided_at = clock.now_utc()
            _history(db, req, p.role, "CANCELLED_BY_ADMIN", p.user.id, reason)
            audit_service.log(db, p.user, "LEAVE_CANCELLED_BY_ADMIN", "leave_request", req.id, {"reason": reason})
            _notify_employee(db, req, "Your approved leave was cancelled", reason)
        else:
            raise HTTPException(403, "You are not allowed to cancel this request")
    elif req.status == S.CANCELLATION_REQUESTED.value and is_owner:
        raise HTTPException(409, "A cancellation request is already pending")
    else:
        raise HTTPException(409, f"A {req.status} request cannot be cancelled")
    db.flush()
    return req
