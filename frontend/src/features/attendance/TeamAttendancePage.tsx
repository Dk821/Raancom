import { useState } from 'react';
import { api } from '../../api/client';
import { AttEvent, DayRow, Employee, Mode, Summary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Alert, Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHead, Spinner, Stat, StatusBadge, Tabs, useToast,
} from '../../components/ui';
import { errMsg, useAsync } from '../../hooks/useAsync';
import { MODE_LABEL, fmtDate, fmtMinutes, fmtTime, fmtWeekday, todayIso } from '../../utils/format';
import CorrectionForm from './CorrectionForm';
import EventLine from './EventLine';

const STATUSES = ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'HOLIDAY', 'WEEKLY_OFF', 'INCOMPLETE', 'CHECKED_IN', 'NOT_MARKED'];

function DayDetail({ row, canFix, onClose, onFix }: { row: DayRow; canFix: boolean; onClose: () => void; onFix: () => void }) {
  const ev = useAsync(() => api.get<AttEvent[]>('/attendance/events', { attendance_date: row.date, employee_id: row.employee_id }), [row.date, row.employee_id]);
  return (
    <Modal title={`${row.employee_name} · ${fmtDate(row.date)}`} onClose={onClose}
      footer={canFix ? <Button variant="primary" onClick={onFix}>Correct this day</Button> : undefined}>
      <div className="stack">
        <div className="row"><StatusBadge status={row.status} />
          {row.late && <Badge tone="warn">Late {row.late_minutes} min</Badge>}
          {row.corrected && <Badge tone="info">Corrected</Badge>}
          <span className="muted small">Shift: {row.shift}</span></div>
        <div>Worked: {fmtMinutes(row.worked_minutes)} · In {fmtTime(row.check_in)} · Out {fmtTime(row.check_out)}</div>
        {ev.loading && <Spinner />}
        {ev.error && <ErrorNote message={ev.error} />}
        {ev.data?.length === 0 && <Empty>No punches recorded.</Empty>}
        {ev.data?.map((e) => <EventLine key={e.id} ev={e} title={e.event_type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} />)}
      </div>
    </Modal>
  );
}

function Register() {
  const { user } = useAuth();
  const isAdmin = user!.role === 'OWNER' || user!.role === 'HR';
  const today = todayIso();
  const [f, setF] = useState({ from: today.slice(0, 8) + '01', to: today, employee_id: '', department: '', mode: '', status: '' });
  const [applied, setApplied] = useState(f);
  const people = useAsync(async () => {
    if (isAdmin) return (await api.get<{ items: Employee[] }>('/employees', { limit: 200, status: 'ACTIVE' })).items;
    return (await api.get<{ items: Employee[] }>('/teams/me')).items;
  }, []);
  const depts = useAsync(() => api.get<string[]>('/employees/departments'), []);
  const res = useAsync(() => api.get<{ rows: DayRow[]; total: number; summary: Summary }>('/attendance', { ...applied }), [applied]);
  const [open, setOpen] = useState<DayRow | null>(null);
  const [fixing, setFixing] = useState<DayRow | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <Field label="From">{(id) => <input id={id} type="date" value={f.from} max={f.to} onChange={set('from')} />}</Field>
        <Field label="To">{(id) => <input id={id} type="date" value={f.to} max={today} onChange={set('to')} />}</Field>
        <Field label="Employee">
          {(id) => (
            <select id={id} value={f.employee_id} onChange={set('employee_id')}>
              <option value="">All</option>
              {people.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Department">
          {(id) => (
            <select id={id} value={f.department} onChange={set('department')}>
              <option value="">All</option>
              {depts.data?.map((d) => <option key={d}>{d}</option>)}
            </select>
          )}
        </Field>
        <Field label="Mode">
          {(id) => (
            <select id={id} value={f.mode} onChange={set('mode')}>
              <option value="">Any</option>
              {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Status">
          {(id) => (
            <select id={id} value={f.status} onChange={set('status')}>
              <option value="">Any</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          )}
        </Field>
        <Button variant="primary" type="submit">Apply</Button>
      </form>

      {res.loading && !res.data && <Spinner />}
      {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {res.data && (
        <>
          <div className="grid cols-4 stats" style={{ marginBottom: 14 }}>
            <Stat value={res.data.summary.present} label="Present days" tone="ok" />
            <Stat value={res.data.summary.absent} label="Absent days" tone={res.data.summary.absent ? 'bad' : undefined} />
            <Stat value={res.data.summary.late_count} label="Late arrivals" tone={res.data.summary.late_count ? 'warn' : undefined} />
            <Stat value={res.data.summary.incomplete} label="Incomplete" tone={res.data.summary.incomplete ? 'bad' : undefined} />
          </div>
          <Card flush>
            {res.data.rows.length === 0 ? <Empty>No records match these filters.</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Employee</th><th>Status</th><th>In</th><th>Out</th><th>Worked</th><th>Mode</th><th>Location</th></tr></thead>
                  <tbody>
                    {res.data.rows.map((r) => (
                      <tr key={`${r.employee_id}-${r.date}`} className="click" onClick={() => setOpen(r)} tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && setOpen(r)}>
                        <td className="nowrap">{fmtWeekday(r.date)}, {fmtDate(r.date)}</td>
                        <td>{r.employee_name}<div className="small muted">{r.employee_code}</div></td>
                        <td><StatusBadge status={r.status} /> {r.late && <Badge tone="warn">Late</Badge>} {r.corrected && <Badge tone="info">Corrected</Badge>}</td>
                        <td>{fmtTime(r.check_in)}</td>
                        <td>{fmtTime(r.check_out)}</td>
                        <td>{fmtMinutes(r.worked_minutes)}</td>
                        <td>{r.mode ? MODE_LABEL[r.mode] : '—'}</td>
                        <td>{r.geofence_status ? <StatusBadge status={r.review_status === 'FLAGGED' ? 'FLAGGED' : r.geofence_status} /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {res.data.total > res.data.rows.length && <p className="muted small mt-s">Showing the first {res.data.rows.length} of {res.data.total} rows. Narrow the filters or export a report.</p>}
        </>
      )}
      {open && <DayDetail row={open} canFix={isAdmin && open.employee_id !== user!.employee.id}
        onClose={() => setOpen(null)} onFix={() => { setFixing(open); setOpen(null); }} />}
      {fixing && <CorrectionForm defaultDate={fixing.date} employee={{ id: fixing.employee_id, name: fixing.employee_name }}
        onClose={() => setFixing(null)} onDone={() => { setFixing(null); res.reload(); }} />}
    </>
  );
}

function Exceptions() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user!.role === 'OWNER' || user!.role === 'HR';
  const res = useAsync(() => api.get<{ flagged: AttEvent[]; incomplete: DayRow[] }>('/attendance/exceptions'), []);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [fixing, setFixing] = useState<DayRow | null>(null);

  const review = async (id: number) => {
    setBusy(id);
    try {
      await api.post(`/attendance/events/${id}/review`, { note: notes[id] ?? '' });
      toast.show('Marked as reviewed');
      res.reload();
    } catch (e) {
      toast.show(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (res.loading && !res.data) return <Spinner />;
  if (res.error || !res.data) return <ErrorNote message={res.error ?? 'Unavailable'} onRetry={res.reload} />;
  return (
    <div className="stack">
      <Card title={`Location & accuracy flags (${res.data.flagged.length})`}>
        {res.data.flagged.length === 0 && <Empty>Nothing waiting for review.</Empty>}
        <div className="stack">
          {res.data.flagged.map((ev) => (
            <div key={ev.id} className="card" style={{ background: 'var(--surface-2)' }}>
              <div className="row between">
                <strong>{ev.employee_name} <span className="muted small">{ev.employee_code}</span></strong>
                <span className="small muted">{fmtDate(ev.attendance_date)}</span>
              </div>
              <div className="mt-s"><EventLine ev={ev} title={ev.event_type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} /></div>
              <div className="small muted mt-s">
                {ev.geofence_status === 'OUTSIDE' && `Outside the allowed radius by ${Math.max(0, Math.round((ev.distance_m ?? 0) - (ev.radius_m ?? 0)))} m. `}
                {ev.accuracy_m !== null && `GPS accuracy ±${Math.round(ev.accuracy_m)} m. `}
                {ev.geofence_status === 'NO_LOCATION' && 'No location was provided. '}
                GPS and photo are evidence, not proof of presence.
              </div>
              <div className="row mt-s">
                <input type="text" className="grow" placeholder="Comment (optional)" aria-label="Review comment" value={notes[ev.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [ev.id]: e.target.value })} maxLength={500} />
                <Button variant="primary" loading={busy === ev.id} onClick={() => review(ev.id)}>Mark reviewed</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`Incomplete days — last 30 days (${res.data.incomplete.length})`} flush>
        {res.data.incomplete.length === 0 ? <Empty>No missing check-outs.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Employee</th><th>Checked in</th><th /></tr></thead>
              <tbody>
                {res.data.incomplete.map((r) => (
                  <tr key={`${r.employee_id}-${r.date}`}>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.employee_name}</td>
                    <td>{fmtTime(r.check_in)} · no check-out</td>
                    <td className="right">{isAdmin && <Button small onClick={() => setFixing(r)}>Correct</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {!isAdmin && <Alert tone="info">Employees fix missing check-outs with a correction request; you will see it under Approvals.</Alert>}
      {fixing && <CorrectionForm defaultDate={fixing.date} employee={{ id: fixing.employee_id, name: fixing.employee_name }}
        onClose={() => setFixing(null)} onDone={() => { setFixing(null); res.reload(); }} />}
    </div>
  );
}

export default function TeamAttendancePage() {
  const [tab, setTab] = useState<'register' | 'exceptions'>('register');
  const ex = useAsync(() => api.get<{ flagged: unknown[]; incomplete: unknown[] }>('/attendance/exceptions'), []);
  const count = (ex.data?.flagged.length ?? 0) + (ex.data?.incomplete.length ?? 0);
  return (
    <>
      <PageHead title="Team attendance" subtitle="Daily register and items that need your review." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'register', label: 'Register' },
        { id: 'exceptions', label: 'Exceptions', badge: count },
      ]} />
      {tab === 'register' ? <Register /> : <Exceptions />}
    </>
  );
}
