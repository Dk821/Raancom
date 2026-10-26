import { useState } from 'react';
import { api } from '../../api/client';
import { Holiday, LeaveType, Office, Shift } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Alert, Badge, Button, Card, Check, Empty, ErrorNote, Field, Modal, PageHead, Spinner, Tabs, useToast,
} from '../../components/ui';
import { errMsg, useAsync } from '../../hooks/useAsync';
import { fmtDate, todayIso } from '../../utils/format';

type Tab = 'company' | 'leave' | 'shifts' | 'holidays' | 'offices';
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

interface Settings {
  company_name: string; timezone: string; weekly_offs: string; outside_radius_action: 'FLAG' | 'BLOCK';
  max_gps_accuracy_m: number; max_shift_hours: number; correction_window_days: number;
  manager_can_review_corrections: boolean; late_rule_enabled: boolean; late_count_for_half_day: number;
  photo_retention_days: number | null; hr_second_level_leave: boolean; weekends_count_as_leave: boolean;
  holidays_count_as_leave: boolean; allow_backdated_leave: boolean; backdated_max_days: number;
  insufficient_balance_action: 'BLOCK' | 'ALLOW'; approved_leave_cancel_needs_approval: boolean;
  hr_can_manage_managers: boolean; hr_can_edit_leave_policy: boolean;
}

const hhmm = (t: string) => t.slice(0, 5);

/* ------------------------------------------------------------ company rules */
function CompanyRules({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const res = useAsync(() => api.get<Settings>('/policies/settings'), []);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (res.loading && !res.data) return <Spinner />;
  if (res.error || !res.data) return <ErrorNote message={res.error ?? 'Unavailable'} onRetry={res.reload} />;
  const s = draft ?? res.data;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft({ ...s, [k]: v });
  const offs = s.weekly_offs.split(',').filter(Boolean);
  const num = (k: keyof Settings) => (e: { target: { value: string } }) => set(k, Number(e.target.value) as never);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.put<Settings>('/policies/settings', draft);
      res.setData(saved);
      setDraft(null);
      toast.show('Company rules saved');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="stack">
        {!canEdit && <Alert tone="info">Only the Owner can change company rules. You can view them here.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <Card title="Company">
          <div className="form-grid">
            <Field label="Company name">{(id) => <input id={id} type="text" value={s.company_name} onChange={(e) => set('company_name', e.target.value)} />}</Field>
            <Field label="Time zone" hint="IANA name, e.g. Asia/Kolkata. Decides what “today” means.">
              {(id) => <input id={id} type="text" value={s.timezone} onChange={(e) => set('timezone', e.target.value)} />}
            </Field>
            <div className="span-2">
              <div className="muted small" style={{ marginBottom: 6 }}>Weekly off days</div>
              <div className="row">
                {DAYS.map((d) => (
                  <Check key={d} checked={offs.includes(d)} onChange={(v) => set('weekly_offs', DAYS.filter((x) => (x === d ? v : offs.includes(x))).join(','))}>{d}</Check>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Attendance">
          <div className="form-grid">
            <Field label="Check-in outside the office radius" hint="Flag keeps the record and sends it for HR review. Block rejects it.">
              {(id) => <select id={id} value={s.outside_radius_action} onChange={(e) => set('outside_radius_action', e.target.value as Settings['outside_radius_action'])}>
                <option value="FLAG">Save and flag for review</option><option value="BLOCK">Block the check-in</option></select>}
            </Field>
            <Field label="Worst acceptable GPS accuracy (metres)" hint="Readings less accurate than this are flagged.">
              {(id) => <input id={id} type="number" min={5} max={5000} value={s.max_gps_accuracy_m} onChange={num('max_gps_accuracy_m')} />}
            </Field>
            <Field label="Longest shift before a check-in goes stale (hours)">
              {(id) => <input id={id} type="number" min={4} max={24} value={s.max_shift_hours} onChange={num('max_shift_hours')} />}
            </Field>
            <Field label="Correction window (days)" hint="How far back an employee may request a correction.">
              {(id) => <input id={id} type="number" min={1} max={365} value={s.correction_window_days} onChange={num('correction_window_days')} />}
            </Field>
            <Field label="Delete photos after (days)" hint="Blank keeps photos until you purge them.">
              {(id) => <input id={id} type="number" min={1} max={3650} value={s.photo_retention_days ?? ''}
                onChange={(e) => set('photo_retention_days', e.target.value === '' ? null : Number(e.target.value))} />}
            </Field>
            <div className="span-2 stack">
              <Check checked={s.manager_can_review_corrections} onChange={(v) => set('manager_can_review_corrections', v)}>Reporting managers can review attendance corrections</Check>
              <Check checked={s.late_rule_enabled} onChange={(v) => set('late_rule_enabled', v)}>Track late arrivals (uses each shift’s grace period)</Check>
              {s.late_rule_enabled && (
                <Field label="Late arrivals that count as one half-day deduction">
                  {(id) => <input id={id} type="number" min={1} max={31} value={s.late_count_for_half_day} onChange={num('late_count_for_half_day')} style={{ maxWidth: 140 }} />}
                </Field>
              )}
            </div>
          </div>
        </Card>

        <Card title="Leave">
          <div className="stack">
            <Check checked={s.hr_second_level_leave} onChange={(v) => set('hr_second_level_leave', v)}>Require HR approval after the manager (second level)</Check>
            <Check checked={s.weekends_count_as_leave} onChange={(v) => set('weekends_count_as_leave', v)}>Weekly offs inside a leave period count as leave days</Check>
            <Check checked={s.holidays_count_as_leave} onChange={(v) => set('holidays_count_as_leave', v)}>Holidays inside a leave period count as leave days</Check>
            <Check checked={s.approved_leave_cancel_needs_approval} onChange={(v) => set('approved_leave_cancel_needs_approval', v)}>Cancelling approved leave needs approval</Check>
            <Check checked={s.allow_backdated_leave} onChange={(v) => set('allow_backdated_leave', v)}>Allow applying for past dates</Check>
            {s.allow_backdated_leave && (
              <Field label="Furthest back an application may go (days)">
                {(id) => <input id={id} type="number" min={0} max={365} value={s.backdated_max_days} onChange={num('backdated_max_days')} style={{ maxWidth: 140 }} />}
              </Field>
            )}
            <Field label="When the balance is not enough">
              {(id) => <select id={id} value={s.insufficient_balance_action} onChange={(e) => set('insufficient_balance_action', e.target.value as Settings['insufficient_balance_action'])} style={{ maxWidth: 360 }}>
                <option value="BLOCK">Block the application</option><option value="ALLOW">Allow it (balance may go negative)</option></select>}
            </Field>
          </div>
        </Card>

        <Card title="HR permissions">
          <div className="stack">
            <Check checked={s.hr_can_manage_managers} onChange={(v) => set('hr_can_manage_managers', v)}>HR can assign and edit Reporting Manager accounts</Check>
            <Check checked={s.hr_can_edit_leave_policy} onChange={(v) => set('hr_can_edit_leave_policy', v)}>HR can edit leave types and holidays</Check>
          </div>
        </Card>

        {canEdit && (
          <div className="row">
            <Button variant="primary" loading={busy} disabled={draft === null} onClick={save}>Save company rules</Button>
            {draft && <Button onClick={() => setDraft(null)}>Discard changes</Button>}
          </div>
        )}
      </div>
    </fieldset>
  );
}

/* --------------------------------------------------------------- leave types */
interface LTForm { code: string; name: string; is_paid: boolean; allows_half_day: boolean; balance_required: boolean;
  annual_entitlement: string; carry_forward_max: string; requires_attachment: boolean; is_active: boolean }

function LeaveTypeModal({ lt, onClose, onDone }: { lt: LeaveType | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<LTForm>(lt ? {
    code: lt.code, name: lt.name, is_paid: lt.is_paid, allows_half_day: lt.allows_half_day, balance_required: lt.balance_required,
    annual_entitlement: String(lt.annual_entitlement), carry_forward_max: String(lt.carry_forward_max),
    requires_attachment: lt.requires_attachment, is_active: lt.is_active,
  } : { code: '', name: '', is_paid: true, allows_half_day: true, balance_required: true, annual_entitlement: '0', carry_forward_max: '0', requires_attachment: false, is_active: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const body = { ...f, annual_entitlement: Number(f.annual_entitlement), carry_forward_max: Number(f.carry_forward_max) };
    try {
      if (lt) {
        const { code: _code, ...rest } = body;
        void _code;
        await api.patch(`/policies/leave-types/${lt.id}`, rest);
      } else {
        await api.post('/policies/leave-types', { ...body, code: body.code.trim().toUpperCase() });
      }
      toast.show('Leave type saved');
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={lt ? `Edit ${lt.code}` : 'New leave type'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={!f.code || !f.name}>Save</Button></>}>
      <div className="stack">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-grid">
          <Field label="Code" hint={lt ? 'Cannot be changed' : 'Short, e.g. CL'}>{(id) => <input id={id} type="text" maxLength={16} value={f.code} disabled={!!lt} onChange={(e) => setF({ ...f, code: e.target.value })} />}</Field>
          <Field label="Name">{(id) => <input id={id} type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Days per year" hint="Credited at rollover">{(id) => <input id={id} type="number" min={0} step="0.5" value={f.annual_entitlement} onChange={(e) => setF({ ...f, annual_entitlement: e.target.value })} />}</Field>
          <Field label="Max carry-forward">{(id) => <input id={id} type="number" min={0} step="0.5" value={f.carry_forward_max} onChange={(e) => setF({ ...f, carry_forward_max: e.target.value })} />}</Field>
        </div>
        <Check checked={f.balance_required} onChange={(v) => setF({ ...f, balance_required: v })}>Tracked against a balance</Check>
        <Check checked={f.is_paid} onChange={(v) => setF({ ...f, is_paid: v })}>Paid leave</Check>
        <Check checked={f.allows_half_day} onChange={(v) => setF({ ...f, allows_half_day: v })}>Half-day allowed</Check>
        <Check checked={f.requires_attachment} onChange={(v) => setF({ ...f, requires_attachment: v })}>Supporting document required</Check>
        <Check checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })}>Active (available to employees)</Check>
      </div>
    </Modal>
  );
}

function LeaveTypes({ canEdit, isOwner }: { canEdit: boolean; isOwner: boolean }) {
  const toast = useToast();
  const res = useAsync(() => api.get<LeaveType[]>('/leave/types', { include_inactive: true }), []);
  const [edit, setEdit] = useState<LeaveType | 'new' | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rollover = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<Record<string, unknown>>('/leave/rollover', { year: Number(year) });
      toast.show(`Year ${year} rolled over${r && typeof r.created === 'number' ? ` (${r.created} balances)` : ''}`);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {!canEdit && <Alert tone="info">Leave types are view-only for you.</Alert>}
      <Card flush title={<span style={{ padding: '0 18px' }}>Leave types</span>}
        actions={canEdit ? <Button variant="primary" small onClick={() => setEdit('new')}>Add leave type</Button> : undefined}>
        {res.loading && !res.data && <Spinner />}
        {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
        {res.data && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Per year</th><th>Carry</th><th>Rules</th><th></th></tr></thead>
              <tbody>
                {res.data.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.code}</strong> {!t.is_active && <Badge>Inactive</Badge>}</td>
                    <td>{t.name}</td>
                    <td>{t.balance_required ? t.annual_entitlement : '—'}</td>
                    <td>{t.balance_required ? t.carry_forward_max : '—'}</td>
                    <td className="small muted">
                      {[t.balance_required ? 'balance' : 'no balance', t.is_paid ? 'paid' : 'unpaid', t.allows_half_day ? 'half-day' : null, t.requires_attachment ? 'document' : null].filter(Boolean).join(' · ')}
                    </td>
                    <td>{canEdit && <Button small onClick={() => setEdit(t)}>Edit</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {isOwner && (
        <Card title="Start a new leave year">
          <div className="stack">
            <p className="muted small">Carries forward unused balances (up to each type’s cap) and credits the yearly entitlement for every active employee. Running it twice for the same year does not double-credit.</p>
            {err && <Alert tone="error">{err}</Alert>}
            <div className="row">
              <input aria-label="Year" type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 110 }} />
              <Button loading={busy} onClick={rollover}>Run rollover</Button>
            </div>
          </div>
        </Card>
      )}
      {edit && <LeaveTypeModal lt={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); res.reload(); }} />}
    </div>
  );
}

/* -------------------------------------------------------------------- shifts */
function ShiftModal({ shift, onClose, onDone }: { shift: Shift | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: shift?.name ?? '', start_time: shift ? hhmm(shift.start_time) : '09:00', end_time: shift ? hhmm(shift.end_time) : '18:00',
    grace_minutes: String(shift?.grace_minutes ?? 15), half_day_hours: String(shift?.half_day_hours ?? 4), full_day_hours: String(shift?.full_day_hours ?? 8),
    is_overnight: shift?.is_overnight ?? false, is_default: shift?.is_default ?? false, is_active: shift?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const body = { ...f, grace_minutes: Number(f.grace_minutes), half_day_hours: Number(f.half_day_hours), full_day_hours: Number(f.full_day_hours) };
    try {
      if (shift) await api.patch(`/policies/shifts/${shift.id}`, body);
      else await api.post('/policies/shifts', body);
      toast.show('Shift saved');
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={shift ? `Edit ${shift.name}` : 'New shift'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={!f.name}>Save</Button></>}>
      <div className="stack">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-grid">
          <Field label="Name" className="span-2">{(id) => <input id={id} type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Starts">{(id) => <input id={id} type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />}</Field>
          <Field label="Ends">{(id) => <input id={id} type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />}</Field>
          <Field label="Grace (minutes)">{(id) => <input id={id} type="number" min={0} max={240} value={f.grace_minutes} onChange={(e) => setF({ ...f, grace_minutes: e.target.value })} />}</Field>
          <span />
          <Field label="Hours for a half day" hint="At least this many worked">{(id) => <input id={id} type="number" min={1} max={24} step="0.5" value={f.half_day_hours} onChange={(e) => setF({ ...f, half_day_hours: e.target.value })} />}</Field>
          <Field label="Hours for a full day">{(id) => <input id={id} type="number" min={1} max={24} step="0.5" value={f.full_day_hours} onChange={(e) => setF({ ...f, full_day_hours: e.target.value })} />}</Field>
        </div>
        <Check checked={f.is_overnight} onChange={(v) => setF({ ...f, is_overnight: v })}>Ends the next day (overnight)</Check>
        <Check checked={f.is_default} onChange={(v) => setF({ ...f, is_default: v })}>Default shift for everyone without an assignment</Check>
        <Check checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })}>Active</Check>
      </div>
    </Modal>
  );
}

function Shifts({ isOwner }: { isOwner: boolean }) {
  const res = useAsync(() => api.get<Shift[]>('/policies/shifts'), []);
  const [edit, setEdit] = useState<Shift | 'new' | null>(null);
  return (
    <div className="stack">
      <Alert tone="info">To put an employee on a shift, open them under Employees. Everyone else uses the default shift.</Alert>
      <Card flush title={<span style={{ padding: '0 18px' }}>Shifts</span>}
        actions={isOwner ? <Button variant="primary" small onClick={() => setEdit('new')}>Add shift</Button> : undefined}>
        {res.loading && !res.data && <Spinner />}
        {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
        {res.data && (res.data.length === 0 ? <Empty>No shifts yet.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Hours</th><th>Grace</th><th>Half / full day</th><th></th></tr></thead>
              <tbody>
                {res.data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name} {s.is_default && <Badge tone="brand">Default</Badge>} {!s.is_active && <Badge>Inactive</Badge>}</td>
                    <td>{hhmm(s.start_time)}–{hhmm(s.end_time)}{s.is_overnight && ' (+1 day)'}</td>
                    <td>{s.grace_minutes} min</td>
                    <td>{s.half_day_hours} h / {s.full_day_hours} h</td>
                    <td>{isOwner && <Button small onClick={() => setEdit(s)}>Edit</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Card>
      {edit && <ShiftModal shift={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); res.reload(); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ holidays */
function Holidays({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const res = useAsync(() => api.get<Holiday[]>('/policies/holidays', { year }), [year]);
  const [f, setF] = useState({ date: todayIso(), name: '', holiday_type: 'PUBLIC' });
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setError(null);
    try {
      await api.post('/policies/holidays', f);
      setF({ ...f, name: '' });
      res.reload();
      toast.show('Holiday added');
    } catch (e) {
      setError(errMsg(e));
    }
  };
  const remove = async (h: Holiday) => {
    try {
      await api.del(`/policies/holidays/${h.id}`);
      res.reload();
      toast.show('Holiday removed');
    } catch (e) {
      toast.show(errMsg(e), 'error');
    }
  };
  return (
    <div className="stack">
      {canEdit && (
        <Card title="Add a holiday">
          <div className="stack">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="filters" style={{ marginBottom: 0 }}>
              <Field label="Date">{(id) => <input id={id} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
              <Field label="Name" className="grow">{(id) => <input id={id} type="text" maxLength={150} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
              <Field label="Type">
                {(id) => <select id={id} value={f.holiday_type} onChange={(e) => setF({ ...f, holiday_type: e.target.value })}>
                  <option value="PUBLIC">Public</option><option value="COMPANY">Company</option></select>}
              </Field>
              <Button variant="primary" onClick={add} disabled={!f.name.trim() || !f.date}>Add</Button>
            </div>
          </div>
        </Card>
      )}
      <Card flush title={<span style={{ padding: '0 18px' }}>Holidays {year}</span>}
        actions={<div className="row" style={{ padding: '0 18px' }}><Button small onClick={() => setYear(year - 1)}>‹</Button><Button small onClick={() => setYear(year + 1)}>›</Button></div>}>
        {res.loading && !res.data && <Spinner />}
        {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
        {res.data && (res.data.length === 0 ? <Empty>No holidays for {year}.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Name</th><th>Type</th><th></th></tr></thead>
              <tbody>
                {res.data.map((h) => (
                  <tr key={h.id}>
                    <td className="nowrap">{fmtDate(h.date)}</td><td>{h.name}</td><td><Badge>{h.holiday_type.toLowerCase()}</Badge></td>
                    <td>{canEdit && <Button small variant="danger" onClick={() => remove(h)}>Remove</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------- offices */
function OfficeModal({ office, onClose, onDone }: { office: Office | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: office?.name ?? '', latitude: office?.latitude !== undefined ? String(office.latitude) : '',
    longitude: office?.longitude !== undefined ? String(office.longitude) : '', radius_m: String(office?.radius_m ?? 100), is_active: office?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const useMine = () => {
    if (!navigator.geolocation) return setError('This browser cannot provide your location.');
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setF((x) => ({ ...x, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })); setLocating(false); },
      () => { setError('Could not get your location. Allow location access, or type the coordinates.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const valid = f.name.trim() && f.latitude !== '' && f.longitude !== '' && !Number.isNaN(Number(f.latitude)) && !Number.isNaN(Number(f.longitude));
  const save = async () => {
    setBusy(true);
    setError(null);
    const body = { name: f.name.trim(), latitude: Number(f.latitude), longitude: Number(f.longitude), radius_m: Number(f.radius_m), is_active: f.is_active };
    try {
      if (office) await api.patch(`/offices/${office.id}`, body);
      else await api.post('/offices', body);
      toast.show('Office saved');
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={office ? `Edit ${office.name}` : 'New office'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={save}>Save</Button></>}>
      <div className="stack">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Office name">{(id) => <input id={id} type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <div className="form-grid">
          <Field label="Latitude">{(id) => <input id={id} type="text" inputMode="decimal" value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} />}</Field>
          <Field label="Longitude">{(id) => <input id={id} type="text" inputMode="decimal" value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} />}</Field>
        </div>
        <div><Button loading={locating} onClick={useMine}>Use my current location</Button> <span className="muted small">Stand inside the office when you do this.</span></div>
        <Field label="Allowed radius (metres)" hint="10–5000. Check-ins farther than this are flagged or blocked.">
          {(id) => <input id={id} type="number" min={10} max={5000} value={f.radius_m} onChange={(e) => setF({ ...f, radius_m: e.target.value })} />}
        </Field>
        <Check checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })}>Active</Check>
      </div>
    </Modal>
  );
}

function Offices({ isOwner }: { isOwner: boolean }) {
  const res = useAsync(() => api.get<Office[]>('/offices'), []);
  const [edit, setEdit] = useState<Office | 'new' | null>(null);
  return (
    <div className="stack">
      {res.data && res.data.filter((o) => o.is_active).length === 0 && (
        <Alert tone="warn">No active office is set up. Office check-ins cannot be verified until you add one.</Alert>
      )}
      <Card flush title={<span style={{ padding: '0 18px' }}>Offices</span>}
        actions={isOwner ? <Button variant="primary" small onClick={() => setEdit('new')}>Add office</Button> : undefined}>
        {res.loading && !res.data && <Spinner />}
        {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
        {res.data && (res.data.length === 0 ? <Empty>No offices yet.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Location</th><th>Radius</th><th></th></tr></thead>
              <tbody>
                {res.data.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name} {!o.is_active && <Badge>Inactive</Badge>}</td>
                    <td className="small">{o.latitude?.toFixed(5)}, {o.longitude?.toFixed(5)}</td>
                    <td>{o.radius_m} m</td>
                    <td>{isOwner && <Button small onClick={() => setEdit(o)}>Edit</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Card>
      {edit && <OfficeModal office={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); res.reload(); }} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- page */
export default function PoliciesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('company');
  const isOwner = user!.role === 'OWNER';
  const canLeave = user!.permissions.edit_leave_policy;
  return (
    <>
      <PageHead title="Policies & setup" subtitle="Company rules, leave types, shifts, holidays and office locations." />
      <Alert tone="warn">
        The values shipped here (leave entitlements, shift hours, grace period, weekly off) are starting defaults, not company policy. Confirm them before go-live.
      </Alert>
      <div className="mt-s" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'company', label: 'Company rules' }, { id: 'leave', label: 'Leave types' }, { id: 'shifts', label: 'Shifts' },
        { id: 'holidays', label: 'Holidays' }, { id: 'offices', label: 'Offices' },
      ]} />
      {tab === 'company' && <CompanyRules canEdit={user!.permissions.edit_company_policy} />}
      {tab === 'leave' && <LeaveTypes canEdit={canLeave} isOwner={isOwner} />}
      {tab === 'shifts' && <Shifts isOwner={isOwner} />}
      {tab === 'holidays' && <Holidays canEdit={canLeave} />}
      {tab === 'offices' && <Offices isOwner={isOwner} />}
    </>
  );
}
