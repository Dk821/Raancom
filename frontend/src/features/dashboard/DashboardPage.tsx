import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { DayRow, LeaveBalance, Summary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Card, Empty, ErrorNote, PageHead, Spinner, Stat, StatusBadge } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { fmtDate, fmtDateTime, fmtDays, fmtMinutes, fmtTime, titleCase } from '../../utils/format';

interface Dash {
  date: string;
  role: string;
  me: {
    today: DayRow | null;
    month: Summary;
    balances: LeaveBalance[];
    pending_requests: number;
    pending_corrections: number;
  };
  upcoming_holidays: { date: string; name: string }[];
  team?: {
    headcount: number;
    today: Record<'present' | 'half_day' | 'absent' | 'leave' | 'checked_in' | 'not_marked' | 'incomplete' | 'holiday' | 'weekly_off', number>;
    pending_leave_approvals: number;
    pending_corrections: number;
    flagged_events: number;
    late_this_month: DayRow[];
    absent_today: DayRow[];
    incomplete_recent: DayRow[];
    headcount_total?: number;
    inactive?: number;
    on_leave_today?: number;
  };
  recent_audit?: { id: number; action: string; entity_type: string; created_at: string }[];
}

function MyDay({ d }: { d: Dash }) {
  const t = d.me.today;
  return (
    <Card title="Today" actions={<Link to="/attendance"><Button small variant="primary">Open attendance</Button></Link>}>
      <div className="row between">
        <div>
          <div className="muted small">{fmtDate(d.date)}</div>
          <div style={{ marginTop: 6 }}><StatusBadge status={t?.status ?? 'NOT_MARKED'} /></div>
        </div>
        <div className="row" style={{ gap: 24 }}>
          <div><div className="muted small">Check-in</div><strong>{t?.check_in ? fmtTime(t.check_in) : '—'}</strong></div>
          <div><div className="muted small">Check-out</div><strong>{t?.check_out ? fmtTime(t.check_out) : '—'}</strong></div>
          <div><div className="muted small">Worked</div><strong>{fmtMinutes(t?.worked_minutes)}</strong></div>
        </div>
      </div>
      {t?.late && <p className="small muted mt-s">Marked late by {t.late_minutes} min.</p>}
    </Card>
  );
}

function MyMonth({ d }: { d: Dash }) {
  const m = d.me.month;
  return (
    <Card title="This month" actions={<Link to="/attendance"><Button small>Details</Button></Link>}>
      <div className="grid cols-4">
        <Stat value={m.present} label="Present" tone="ok" />
        <Stat value={m.half_day} label="Half days" />
        <Stat value={m.absent} label="Absent" tone={m.absent ? 'bad' : undefined} />
        <Stat value={m.leave} label="On leave" />
      </div>
      <p className="small muted mt-s">
        {fmtMinutes(m.worked_minutes)} worked
        {m.late_count > 0 && ` · ${m.late_count} late`}
        {m.incomplete > 0 && ` · ${m.incomplete} without check-out`}
      </p>
    </Card>
  );
}

function Balances({ d }: { d: Dash }) {
  const tracked = d.me.balances.filter((b) => b.tracked);
  return (
    <Card title="Leave balance" actions={<Link to="/leave"><Button small>Apply for leave</Button></Link>}>
      {tracked.length === 0 ? <Empty>No tracked leave types.</Empty> : (
        <div className="grid cols-3">
          {tracked.map((b) => (
            <div key={b.leave_type_id} className="stat">
              <div className="v">{fmtDays(b.available)}</div>
              <div className="l">{b.name}{b.pending > 0 && ` · ${fmtDays(b.pending)} pending`}</div>
            </div>
          ))}
        </div>
      )}
      {(d.me.pending_requests > 0 || d.me.pending_corrections > 0) && (
        <p className="small muted mt-s">
          {d.me.pending_requests > 0 && <>{d.me.pending_requests} leave request(s) open. </>}
          {d.me.pending_corrections > 0 && <>{d.me.pending_corrections} correction(s) awaiting review.</>}
        </p>
      )}
    </Card>
  );
}

function RowList({ rows, empty, extra }: { rows: DayRow[]; empty: string; extra: (r: DayRow) => string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }} className="stack">
      {rows.map((r) => (
        <li key={`${r.employee_id}-${r.date}`} className="row between">
          <span>{r.employee_name}<span className="muted small"> · {r.department ?? '—'}</span></span>
          <span className="muted small nowrap">{fmtDate(r.date)} · {extra(r)}</span>
        </li>
      ))}
    </ul>
  );
}

function TeamSection({ d }: { d: Dash }) {
  const { user } = useAuth();
  const t = d.team!;
  const admin = user!.role === 'OWNER' || user!.role === 'HR';
  const scope = admin ? 'Company' : 'Your team';
  return (
    <>
      <h2 style={{ marginTop: 8 }}>{scope} today</h2>
      <div className="grid cols-4">
        <Stat value={t.today.present + t.today.half_day} label={`Present of ${t.headcount}`} tone="ok" to="/team/attendance" />
        <Stat value={t.today.checked_in} label="Checked in, not out" to="/team/attendance" />
        <Stat value={t.today.not_marked} label="Not marked yet" tone={t.today.not_marked ? 'warn' : undefined} to="/team/attendance" />
        <Stat value={t.today.absent} label="Absent" tone={t.today.absent ? 'bad' : undefined} to="/team/attendance" />
        <Stat value={t.today.leave} label="On leave" to="/approvals" />
        <Stat value={t.pending_leave_approvals} label="Leave requests to decide" tone={t.pending_leave_approvals ? 'warn' : undefined} to="/approvals" />
        <Stat value={t.pending_corrections} label="Corrections to review" tone={t.pending_corrections ? 'warn' : undefined} to="/approvals" />
        <Stat value={t.flagged_events} label="Flagged check-ins" tone={t.flagged_events ? 'warn' : undefined} to="/team/attendance" />
      </div>
      {admin && t.headcount_total !== undefined && (
        <p className="muted small">{t.headcount_total} accounts in total{t.inactive ? `, ${t.inactive} inactive` : ''}.</p>
      )}
      <div className="grid cols-2">
        <Card title="Absent today"><RowList rows={t.absent_today} empty="Nobody is marked absent." extra={() => 'absent'} /></Card>
        <Card title="Missing check-out (this month)">
          <RowList rows={t.incomplete_recent} empty="No missing check-outs." extra={(r) => (r.check_in ? `in ${fmtTime(r.check_in)}` : '')} />
        </Card>
        {user!.role !== 'EMPLOYEE' && (
          <Card title="Late arrivals (this month)">
            <RowList rows={t.late_this_month} empty="No late arrivals, or the late rule is off." extra={(r) => `${r.late_minutes} min late`} />
          </Card>
        )}
        {d.recent_audit && (
          <Card title="Recent activity" actions={<Link to="/audit"><Button small>Audit log</Button></Link>}>
            {d.recent_audit.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }} className="stack">
                {d.recent_audit.map((a) => (
                  <li key={a.id} className="row between">
                    <span><Badge>{titleCase(a.action)}</Badge></span>
                    <span className="muted small">{fmtDateTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const res = useAsync(() => api.get<Dash>('/dashboard'), []);
  return (
    <>
      <PageHead title={`Hello, ${user!.employee.full_name.split(' ')[0]}`} subtitle="Here is where things stand today." />
      {res.loading && !res.data && <Spinner />}
      {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {res.data && (
        <div className="stack">
          <div className="grid cols-2">
            <MyDay d={res.data} />
            <MyMonth d={res.data} />
          </div>
          <Balances d={res.data} />
          {res.data.upcoming_holidays.length > 0 && (
            <Card title="Upcoming holidays">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {res.data.upcoming_holidays.map((h) => <li key={h.date}>{fmtDate(h.date)} — {h.name}</li>)}
              </ul>
            </Card>
          )}
          {res.data.team && <TeamSection d={res.data} />}
        </div>
      )}
    </>
  );
}
