from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_roles
from app.core.enums import Role
from app.core.permissions import Principal
from app.db.session import get_db
from app.services import audit_service, report_service

router = APIRouter(prefix="/reports", tags=["reports"])
allowed = require_roles(Role.OWNER, Role.HR, Role.REPORTING_MANAGER)


def _filters(from_date, to_date, employee_id, department, manager_id, mode, status, leave_type_id, year) -> dict:
    return {"from_date": from_date, "to_date": to_date, "employee_id": employee_id, "department": department,
            "manager_id": manager_id, "mode": mode, "status": status, "leave_type_id": leave_type_id, "year": year}


@router.get("/export")
def export(
    request: Request,
    report: str = Query(..., pattern="^(attendance|attendance-summary|leave|leave-balances|leave-ledger|exceptions)$"),
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    from_date: Optional[date] = Query(None, alias="from"), to_date: Optional[date] = Query(None, alias="to"),
    employee_id: Optional[int] = None, department: Optional[str] = None, manager_id: Optional[int] = None,
    mode: Optional[str] = None, status: Optional[str] = None, leave_type_id: Optional[int] = None,
    year: Optional[int] = None, p: Principal = Depends(allowed), db: Session = Depends(get_db),
):
    data = report_service.build_report(
        db, p, report, _filters(from_date, to_date, employee_id, department, manager_id, mode, status, leave_type_id, year))
    audit_service.log(db, p.user, "REPORT_EXPORTED", "report", None,
                      {"report": report, "format": format, "rows": len(data["rows"])}, client_ip(request))
    db.commit()
    fname = f"{report}_{data['from']}_{data['to']}.{format}"
    if format == "csv":
        body, media = report_service.export_csv(data), "text/csv; charset=utf-8"
    else:
        body = report_service.export_xlsx(data)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(content=body, media_type=media, headers={
        "Content-Disposition": f'attachment; filename="{fname}"', "Cache-Control": "private, no-store"})


@router.get("/{report}")
def view(
    report: str,
    from_date: Optional[date] = Query(None, alias="from"), to_date: Optional[date] = Query(None, alias="to"),
    employee_id: Optional[int] = None, department: Optional[str] = None, manager_id: Optional[int] = None,
    mode: Optional[str] = None, status: Optional[str] = None, leave_type_id: Optional[int] = None,
    year: Optional[int] = None, p: Principal = Depends(allowed), db: Session = Depends(get_db),
):
    return report_service.build_report(
        db, p, report, _filters(from_date, to_date, employee_id, department, manager_id, mode, status, leave_type_id, year))
