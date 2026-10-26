import { useState } from 'react';
import { api } from '../../api/client';
import { Employee, LeaveBalance, LeaveType, Page, Role, Shift } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Alert, Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHead, Pager, Secret, Spinner, StatusBadge, useToast,
} from '../../components/ui';
import { errMsg, useAsync } from '../../hooks/useAsync';
import { ROLE_LABEL, fmtDate, fmtDays, todayIso } from '../../utils/format';

const ALL_ROLES: Role[] = ['EMPLOYEE', 'REPORTING_MANAGER', 'HR', 'OWNER'];

function useAssignableRoles(): Role[] {
  const { user } = useAuth();
  return user!.role === 'OWNER' ? ALL_ROLES : ['EMPLOYEE', 'REPORTING_MANAGER'];
}

interface Form {
  email: string; full_name: string; role: Role; employee_code: string; department: string; designation: string;
  joining_date: string; manager_id: string; phone: string;
}
const blank: Form = {
  email: '', full_name: '', role: 'EMPLOYEE', employee_code: '', department: '', designation: '',
  joining_date: todayIso(), manager_id: '', phone: '',
};

function Managers({ value, onChange, exclude }: { value: string; onChange: (v: string) => void; exclude?: number }) {
  const res = useAsync(() => api.get<{ id: number; full_name: string; employee_code: string; role: Role }[]>('/employees/managers'), []);
  return (
    <Field label="Reporting manager" hint="Approves this person's leave and corrections.">
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">No manager (HR handles requests)</option>
          {res.data?.filter((m) => m.id !== exclude).map((m) => (
            <option key={m.id} value={m.id}>{m.full_name} — {ROLE_LABEL[m.role]} ({m.employee_code})</option>
          ))}
        </select>
      )}
    </Field>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const roles = useAssignableRoles();
  const [f, setF] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ employee: Employee; temporary_password: string }>('/employees', {
        email: f.email.trim(), full_name: f.full_name.trim(), role: f.role,
        employee_code: f.employee_code.trim() || null, department: f.department.trim() || null,
        designation: f.designation.trim() || null, joining_date: f.joining_date,
        manager_id: f.manager_id ? Number(f.manager_id) : null, phone: f.phone.trim() || null,
      });
      setCreated({ name: res.employee.full_name, email: res.employee.email, password: res.temporary_password });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Modal title="Account created" onClose={() => { onDone(); }}
        footer={<Button variant="primary" onClick={onDone}>Done</Button>}>
        <div className="stack">
          <Alert tone="warn">Share this temporary password with {created.name} securely. It is shown only once; they must change it at first sign-in.</Alert>
          <div><div className="muted small">Sign-in email</div><strong>{created.email}</strong></div>
          <Secret value={created.password} />
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Add employee" onClose={onClose} wide
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={submit} disabled={!f.email || f.full_name.trim().length < 2 || !f.joining_date}>Create account</Button></>}>
      <div className="stack">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-grid">
          <Field label="Full name">{(id) => <input id={id} type="text" value={f.full_name} onChange={set('full_name')} />}</Field>
          <Field label="Work email (sign-in)">{(id) => <input id={id} type="email" value={f.email} onChange={set('email')} />}</Field>
          <Field label="Role">
            {(id) => <select id={id} value={f.role} onChange={set('role')}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>}
          </Field>
          <Field label="Employee code" hint="Leave blank to generate">{(id) => <input id={id} type="text" value={f.employee_code} onChange={set('employee_code')} />}</Field>
          <Field label="Department">{(id) => <input id={id} type="text" value={f.department} onChange={set('department')} />}</Field>
          <Field label="Designation">{(id) => <input id={id} type="text" value={f.designation} onChange={set('designation')} />}</Field>
          <Field label="Joining date">{(id) => <input id={id} type="date" value={f.joining_date} onChange={set('joining_date')} />}</Field>
          <Field label="Phone">{(id) => <input id={id} type="text" value={f.phone} onChange={set('phone')} />}</Field>
          <div className="span-2"><Managers value={f.manager_id} onChange={(v) => setF({ ...f, manager_id: v })} /></div>
        </div>
      </div>
    </Modal>
  );
}

function Balances({ emp }: { emp: Employee }) {
  const toast = useToast();
  const bal = useAsync(() => api.get<{ year: number; balances: LeaveBalance[] }>(`/leave/balances/${emp.id}`), [emp.id]);
  const types = useAsync(() => api.get<LeaveType[]>('/leave/types'), []);
  const [typeId, setTypeId] = useState('');
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tracked = types.data?.filter((t) => t.balance_required) ?? [];

  const adjust = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/leave/adjustments', { employee_id: emp.id, leave_type_id: Number(typeId || tracked[0]?.id), days: Number(days), note });
      toast.show('Balance adjusted');
      setDays(''); setNote('');
      bal.reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h3>Leave balances {bal.data && <span className="muted small">({bal.data.year})</span>}</h3>
      {bal.loading && !bal.data && <Spinner />}
      {bal.data && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Allocated</th><th>Used</th><th>Pending</th><th>Balance</th></tr></thead>
            <tbody>
              {bal.data.balances.filter((b) => b.tracked).map((b) => (
                <tr key={b.leave_type_id}><td>{b.code}</td><td>{fmtDays(b.allocated)}</td><td>{fmtDays(b.used)}</td><td>{fmtDays(b.pending)}</td><td><strong>{fmtDays(b.balance)}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Adjust balance (credit or debit)</summary>
        <div className="stack mt-s">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="form-grid">
            <Field label="Leave type">
              {(id) => <select id={id} value={typeId} onChange={(e) => setTypeId(e.target.value)}>{tracked.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}</select>}
            </Field>
            <Field label="Days (+ credit / − debit)" hint="Multiples of 0.5">
              {(id) => <input id={id} type="number" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} />}
            </Field>
            <Field label="Note (kept in the ledger)" className="span-2">
              {(id) => <input id={id} type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}
            </Field>
          </div>
          <div><Button loading={busy} onClick={adjust} disabled={!Number(days) || note.trim().length < 3}>Post adjustment</Button></div>
        </div>
      </details>
    </div>
  );
}

function ShiftAssign({ emp }: { emp: Employee }) {
  const toast = useToast();
  const shifts = useAsync(() => api.get<Shift[]>('/policies/shifts'), []);
  const hist = useAsync(() => api.get<{ id: number; shift: string; effective_from: string; effective_to: string | null }[]>(`/policies/shifts/assignments/${emp.id}`), [emp.id]);
  const [shiftId, setShiftId] = useState('');
  const [from, setFrom] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const assign = async () => {
    setError(null);
    try {
      await api.post('/policies/shifts/assign', { employee_id: emp.id, shift_id: Number(shiftId || shifts.data?.[0]?.id), effective_from: from });
      toast.show('Shift assigned');
      hist.reload();
    } catch (e) {
      setError(errMsg(e));
    }
  };
  return (
    <div className="stack">
      <h3>Shift</h3>
      {error && <Alert tone="error">{error}</Alert>}
      <p className="muted small">{hist.data?.length ? hist.data.map((h) => `${h.shift} from ${fmtDate(h.effective_from)}${h.effective_to ? ` to ${fmtDate(h.effective_to)}` : ''}`).join(' · ') : 'Using the default shift.'}</p>
      <div className="row">
        <select aria-label="Shift" value={shiftId} onChange={(e) => setShiftId(e.target.value)} style={{ width: 'auto' }}>
          {shifts.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
        </select>
        <input aria-label="Effective from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
        <Button onClick={assign}>Assign</Button>
      </div>
    </div>
  );
}

function DetailModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const roles = useAssignableRoles();
  const res = useAsync(() => api.get<Employee>(`/employees/${id}`), [id]);
  const [f, setF] = useState<Partial<Form> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const e = res.data;
  const form: Partial<Form> = f ?? (e ? {
    full_name: e.full_name, role: e.role, department: e.department ?? '', designation: e.designation ?? '',
    joining_date: e.joining_date, manager_id: e.manager_id ? String(e.manager_id) : '', phone: e.phone ?? '',
  } : {});
  const set = (k: keyof Form, v: string) => setF({ ...form, [k]: v });
  const self = e?.id === user!.employee.id;
  const canManage = !!e && (user!.role === 'OWNER' || e.role === 'EMPLOYEE' || e.role === 'REPORTING_MANAGER');
  const roleOptions = e && !roles.includes(e.role) ? [e.role, ...roles] : roles;

  const run = async (label: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.show(msg);
      setF(null);
      res.reload();
      onChanged();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  };

  const save = () => run('save', () => api.patch(`/employees/${id}`, {
    full_name: form.full_name, role: form.role !== e?.role ? form.role : undefined,
    department: form.department || null, designation: form.designation || null, joining_date: form.joining_date,
    manager_id: form.manager_id ? Number(form.manager_id) : undefined,
    clear_manager: !form.manager_id && !!e?.manager_id, phone: form.phone || null,
  }), 'Saved');

  return (
    <Modal title={e ? e.full_name : 'Employee'} onClose={onClose} wide>
      {res.loading && !e && <Spinner />}
      {res.error && <ErrorNote message={res.error} />}
      {e && (
        <div className="stack">
          {error && <Alert tone="error">{error}</Alert>}
          {secret && (
            <Alert tone="warn">
              <div>New temporary password (shown once) — they must change it at next sign-in:</div>
              <div className="mt-s"><Secret value={secret} /></div>
            </Alert>
          )}
          <div className="row">
            <Badge tone="brand">{ROLE_LABEL[e.role]}</Badge> <StatusBadge status={e.status} />
            <span className="muted small">{e.employee_code} · {e.email}{e.last_login_at ? ` · last sign-in ${fmtDate(e.last_login_at)}` : ' · never signed in'}</span>
          </div>
          <fieldset disabled={!canManage || busy !== null} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-grid">
              <Field label="Full name">{(id) => <input id={id} type="text" value={form.full_name ?? ''} onChange={(ev) => set('full_name', ev.target.value)} />}</Field>
              <Field label="Role" hint={self ? 'You cannot change your own role' : undefined}>
                {(id) => <select id={id} value={form.role} disabled={self} onChange={(ev) => set('role', ev.target.value)}>
                  {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>}
              </Field>
              <Field label="Department">{(id) => <input id={id} type="text" value={form.department ?? ''} onChange={(ev) => set('department', ev.target.value)} />}</Field>
              <Field label="Designation">{(id) => <input id={id} type="text" value={form.designation ?? ''} onChange={(ev) => set('designation', ev.target.value)} />}</Field>
              <Field label="Joining date">{(id) => <input id={id} type="date" value={form.joining_date ?? ''} onChange={(ev) => set('joining_date', ev.target.value)} />}</Field>
              <Field label="Phone">{(id) => <input id={id} type="text" value={form.phone ?? ''} onChange={(ev) => set('phone', ev.target.value)} />}</Field>
              <div className="span-2"><Managers value={form.manager_id ?? ''} onChange={(v) => set('manager_id', v)} exclude={e.id} /></div>
            </div>
          </fieldset>
          {!canManage && <Alert tone="info">Only the Owner can change HR and Owner accounts.</Alert>}
          {canManage && (
            <div className="row">
              <Button variant="primary" loading={busy === 'save'} onClick={save} disabled={f === null}>Save changes</Button>
              {!self && (
                <Button loading={busy === 'reset'} onClick={() => run('reset', async () => {
                  const r = await api.post<{ temporary_password: string }>(`/employees/${id}/reset-password`);
                  setSecret(r.temporary_password);
                }, 'Password reset')}>Reset password</Button>
              )}
              {!self && e.status === 'ACTIVE' && (
                <Button variant="danger" loading={busy === 'off'} onClick={() => run('off', () => api.post(`/employees/${id}/deactivate`), 'Account deactivated')}>Deactivate</Button>
              )}
              {e.status === 'INACTIVE' && (
                <Button loading={busy === 'on'} onClick={() => run('on', () => api.post(`/employees/${id}/reactivate`), 'Account reactivated')}>Reactivate</Button>
              )}
            </div>
          )}
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
          <Balances emp={e} />
          {user!.role === 'OWNER' && <ShiftAssign emp={e} />}
        </div>
      )}
    </Modal>
  );
}

export default function EmployeesPage() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState({ q: '', department: '', role: '', status: '' });
  const [f, setF] = useState(applied);
  const [offset, setOffset] = useState(0);
  const depts = useAsync(() => api.get<string[]>('/employees/departments'), []);
  const res = useAsync(() => api.get<Page<Employee>>('/employees', { ...applied, limit: 25, offset }), [applied, offset]);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <PageHead title="Employees" subtitle="Accounts, roles and reporting lines."
        actions={<Button variant="primary" onClick={() => setCreating(true)}>Add employee</Button>} />
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setApplied({ ...f, q }); setOffset(0); }}>
        <Field label="Search" className="grow">{(id) => <input id={id} type="search" placeholder="Name, code or email" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
        <Field label="Department">
          {(id) => <select id={id} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
            <option value="">All</option>{depts.data?.map((d) => <option key={d}>{d}</option>)}</select>}
        </Field>
        <Field label="Role">
          {(id) => <select id={id} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="">All</option>{ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>}
        </Field>
        <Field label="Status">
          {(id) => <select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>}
        </Field>
        <Button variant="primary" type="submit">Search</Button>
      </form>
      {res.loading && !res.data && <Spinner />}
      {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {res.data && (
        <Card flush>
          {res.data.items.length === 0 ? <Empty>No employees match.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Role</th><th>Department</th><th>Reports to</th><th>Joined</th><th>Status</th></tr></thead>
                <tbody>
                  {res.data.items.map((e) => (
                    <tr key={e.id} className="click" tabIndex={0} onClick={() => setOpen(e.id)} onKeyDown={(ev) => ev.key === 'Enter' && setOpen(e.id)}>
                      <td>{e.full_name}<div className="small muted">{e.employee_code} · {e.email}</div></td>
                      <td><Badge tone="brand">{ROLE_LABEL[e.role]}</Badge></td>
                      <td>{e.department ?? '—'}<div className="small muted">{e.designation ?? ''}</div></td>
                      <td>{e.manager_name ?? '—'}</td>
                      <td className="nowrap">{fmtDate(e.joining_date)}</td>
                      <td><StatusBadge status={e.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager total={res.data.total} limit={res.data.limit} offset={offset} onChange={setOffset} />
        </Card>
      )}
      {creating && <CreateModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); res.reload(); depts.reload(); }} />}
      {open !== null && <DetailModal id={open} onClose={() => setOpen(null)} onChanged={() => { res.reload(); depts.reload(); }} />}
    </>
  );
}
