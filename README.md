# Raancom – Employee Management & Attendance System (Phase 1)

React + TypeScript PWA (Vite) · FastAPI · SQLAlchemy 2 · Alembic · MySQL 8

```
backend/    FastAPI app, models, Alembic migration, tests
frontend/   React PWA
deploy/     Sample Nginx, systemd and backup files for a Linux server
```

## What is in Phase 1

Roles: Owner, HR, Reporting Manager, Employee (record-level scoping: a manager only ever sees their own team).

- **Attendance** – check-in and check-out with live photo and GPS (Office / Outside Work / WFH). Time is always the server's. Office distance is checked on the server against the nearest active office. Outside the radius, or poor GPS, the record is saved and **flagged for HR review** (Owner can switch this to *block*).
- **Reverse Geocoding** – when GPS coordinates are available the employee's readable street address (Street · Area · City · District · State · PIN · Country) is displayed alongside every check-in and check-out record, powered by the Google Maps Geocoding API (optional; falls back to raw coordinates if the API key is not configured).
- **Corrections** – requested by the employee with a reason, reviewed by manager/HR; the original events are never changed. HR/Owner can correct directly (audited).
- **Leave** – types, balances kept in an append-only ledger, apply / edit / withdraw, manager approval (optional HR second level, Owner-toggled), half days, cancellation of approved leave, year rollover.
- **Policies** – company rules, leave types, shifts, holidays, multiple offices.
- **Reports** – attendance, summary, exceptions, leave, balances, ledger; CSV and Excel export (spreadsheet-formula safe, audited).
- **Dashboards**, **notifications**, **audit log** (Owner), private photo storage.

## 1. Prerequisites (Windows)

- Python 3.10 or newer
- Node.js 18 or newer
- MySQL 8 (server running)

## 2. Create the database (once)

In a MySQL client as an admin user:

```sql
CREATE DATABASE raancom CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'raancom_app'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON raancom.* TO 'raancom_app'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Backend

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env`: set `DATABASE_URL` (user/password from step 2) and `SECRET_KEY`
(`python -c "import secrets; print(secrets.token_urlsafe(48))"`).

Create the tables and the first Owner account:

```powershell
alembic upgrade head
python -m app.seed init --email you@company.com --name "Your Name"
```

`init` prints a **temporary password once**. You must change it at first sign-in. It is safe to run again; it never overwrites existing data.

Start the API:

```powershell
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/api/docs (turn off with `DOCS_ENABLED=false` in production).

### Running the tests

```powershell
pip install -r requirements-dev.txt
pytest
```

The tests use an in-memory SQLite database, so they need no MySQL. Row-locking behaviour under concurrent approvals is a MySQL feature and is not exercised by them – try two simultaneous approvals on a staging server before go-live.

## 4. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the backend on port 8000.

The **camera needs a secure origin**: `localhost` works for development; on a real server (and on phones) the site must be served over **HTTPS**.

### Google Maps Geocoding (optional)

To display a human-readable street address next to each attendance check-in/check-out:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Enable **Geocoding API**.
2. Create an API key and restrict it to the **Geocoding API** and your domain.
3. Open `frontend/.env` and replace the placeholder:

```env
VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

4. Restart `npm run dev` (Vite reads `.env` at startup).

If no key is set (or the placeholder is left), the feature degrades gracefully: coordinates are shown as `lat, lng` instead of a full address. No API calls are made.

### Light Theme & Styling System

The application includes a comprehensive, high-contrast **Light Theme** crafted for crisp typography, comfortable contrast, and modern visual hierarchy.

- **Theme Files**:
  - `frontend/src/light.css` – Primary light theme stylesheet with complete CSS custom property tokens and explicit light mode component rules.
  - `frontend/public/light.css` – Standalone static distribution for direct stylesheet linking.
  - `frontend/src/styles.css` – Main stylesheet that imports `light.css` as the default theme foundation while respecting system and user preference toggles.
- **Theme Modes & Toggling**:
  - A theme toggle control (`☀️ Light` / `🌙 Dark` / `💻 System`) is available directly in the topbar header.
  - The choice is persisted in `localStorage` (`raancom_theme`) with pre-mount execution to prevent theme flashing on load.
  - Light theme can also be forced programmatically by setting `<html data-theme="light">` or applying the `.theme-light` CSS class.

#### Light Theme Design Tokens

| Token | Value | Description |
|---|---|---|
| `--bg` | `#f4f6f8` | Canvas background (soft neutral grey) |
| `--surface` | `#ffffff` | Primary cards, panels, modals, topbar |
| `--surface-2` | `#f8fafb` | Table headers, row hovers, preformatted code |
| `--border` | `#e2e8ee` | Clean 1px structural card, input & table borders |
| `--text` | `#16212b` | Primary body typography (deep slate navy, WCAG AAA) |
| `--muted` | `#5d6b79` | Secondary captions, timestamps, column labels |
| `--primary` | `#0f766e` | Brand primary color (deep emerald teal) |
| `--primary-hover` | `#0b5f59` | Darker teal for interactive button hover |
| `--primary-soft` | `#dff4f1` | Soft teal tint for unread badges and active states |
| `--ok` / `--ok-soft` | `#166534` / `#dcf5e4` | Approved / present status (green) |
| `--warn` / `--warn-soft` | `#a15c07` / `#fdf1d8` | Pending / half-day / flagged status (amber) |
| `--danger` / `--danger-soft` | `#b42318` / `#fde8e6` | Rejected / absent / error status (red) |
| `--info` / `--info-soft` | `#1d4ed8` / `#e3ecfd` | Informational status / leave status (blue) |
| `--sidebar` | `#ffffff` | Clean white sidebar surface with 1px right border (`#e2e8ee`) |
| `--sidebar-text` | `#475569` | Slate-600 navigation typography (`#0f766e` active teal) |
| `--shadow` | `0 1px 2px rgba(16,24,40,0.06)...` | Subtle soft drop shadows |

## 5. First-time setup in the app (as Owner)

1. **Policies & setup → Offices** – add each office. Stand inside it and use *Use my current location*, then set the radius. Until an office exists, office check-ins cannot be verified.
2. **Policies & setup → Company rules** – confirm time zone, weekly offs, and the outside-radius rule.
3. **Leave types**, **Shifts**, **Holidays** – review and adjust.
4. **Employees → Add employee** – create accounts. Each gets a one-time temporary password to hand over; they change it at first sign-in.

### Policy values are proposed defaults

Leave entitlements (CL 12, SL 6, EL 0), shift 09:00–18:00 with 15 minutes' grace, Sunday as weekly off, the late-arrival rule (off), and the half/full-day hour thresholds are **starting defaults taken from the design document, not confirmed company policy**. They are all editable in the app. Have the client confirm them before go-live. No office and no holidays are pre-loaded.

## 6. Database changes later

Schema changes go through Alembic migrations (`alembic revision --autogenerate -m "describe change"`, review, then `alembic upgrade head`). Do not edit tables by hand.

## 7. Maintenance commands

```powershell
python -m app.seed rollover --year 2027   # new leave year: carry forward (capped) + credit entitlements; safe to repeat
python -m app.seed purge-photos           # deletes photos older than the retention period (only if one is set)
```

The same rollover is available to the Owner in *Policies & setup → Leave types*.

## 8. Production notes

- Build the frontend (`npm run build`) and serve `frontend/dist` with Nginx, proxying `/api` to uvicorn. See `deploy/nginx.conf.sample` and `deploy/raancom.service.sample`.
- Set `ENVIRONMENT=production`, `DOCS_ENABLED=false`, `TRUST_PROXY_HEADERS=true` (behind Nginx), and use HTTPS.
- Keep `PRIVATE_STORAGE_DIR` outside the web root. Photos are served only through the authenticated API.
- Back up the MySQL database **and** the private storage folder together. See `deploy/backup.sh.sample`.
- Sessions can be revoked: deactivating an employee or resetting a password signs them out everywhere.

## Security summary

Argon2id password hashing · server-enforced roles and record-level access (out-of-scope records return 404) · account lockout and IP rate limiting · forced password change for issued passwords · revocable sessions · uploads validated by file content · private photo storage with `no-store` caching · no secrets in the repository · every sensitive action written to an append-only audit log.
