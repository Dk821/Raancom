import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1 import attendance, audit, auth, dashboard, employees, leave, policies, reports
from app.core.config import get_config
from app.db.session import engine

cfg = get_config()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(
    title=cfg.app_name,
    version="1.0.0",
    docs_url="/api/docs" if cfg.docs_enabled else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if cfg.docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """Readable one-line messages; never echo submitted values back (passwords, tokens)."""
    msgs = []
    for e in exc.errors():
        loc = ".".join(str(x) for x in e["loc"] if x not in ("body", "query", "form", "path"))
        msg = e.get("msg", "Invalid value").replace("Value error, ", "")
        msgs.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse(status_code=422, content={"detail": "; ".join(msgs) or "Invalid request"})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logging.getLogger("raancom").exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})


@app.get("/api/health", tags=["health"])
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception:
        raise HTTPException(503, "Database unavailable")


PREFIX = "/api/v1"
for r in (auth.router, employees.router, attendance.router, leave.router, policies.router, policies.offices_router,
          reports.router, audit.router, dashboard.router):
    app.include_router(r, prefix=PREFIX)
