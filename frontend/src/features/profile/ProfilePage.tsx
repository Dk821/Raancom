import { useState } from 'react';
import { api } from '../../api/client';
import { Employee } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Badge, Button, Card, ErrorNote, Field, PageHead, Spinner, useToast } from '../../components/ui';
import { errMsg, useAsync } from '../../hooks/useAsync';
import { ROLE_LABEL, fmtDate } from '../../utils/format';
import { PasswordForm } from '../auth/ChangePasswordPage';

export default function ProfilePage() {
  const { refresh } = useAuth();
  const toast = useToast();
  const res = useAsync(() => api.get<Employee>('/employees/me'), []);
  const [f, setF] = useState<{ phone: string; address: string; emergency_contact_name: string; emergency_contact_phone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e = res.data;
  const form = f ?? {
    phone: e?.phone ?? '', address: e?.address ?? '',
    emergency_contact_name: e?.emergency_contact_name ?? '', emergency_contact_phone: e?.emergency_contact_phone ?? '',
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch('/employees/me', {
        phone: form.phone || null, address: form.address || null,
        emergency_contact_name: form.emergency_contact_name || null, emergency_contact_phone: form.emergency_contact_phone || null,
      });
      toast.show('Profile saved');
      setF(null);
      res.reload();
      refresh();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="My profile" subtitle="Your details. Name, role and manager are managed by HR." />
      {res.loading && !e && <Spinner />}
      {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {e && (
        <div className="grid cols-2">
          <Card title="Employment">
            <div className="form-grid">
              <div><div className="muted small">Name</div><strong>{e.full_name}</strong></div>
              <div><div className="muted small">Employee code</div>{e.employee_code}</div>
              <div><div className="muted small">Email</div>{e.email}</div>
              <div><div className="muted small">Role</div><Badge tone="brand">{ROLE_LABEL[e.role]}</Badge></div>
              <div><div className="muted small">Department</div>{e.department ?? '—'}</div>
              <div><div className="muted small">Designation</div>{e.designation ?? '—'}</div>
              <div><div className="muted small">Reports to</div>{e.manager_name ?? '—'}</div>
              <div><div className="muted small">Joined</div>{fmtDate(e.joining_date)}</div>
            </div>
          </Card>
          <Card title="Contact details">
            <div className="stack">
              {error && <Alert tone="error">{error}</Alert>}
              <Field label="Phone">{(id) => <input id={id} type="tel" value={form.phone} onChange={(ev) => setF({ ...form, phone: ev.target.value })} />}</Field>
              <Field label="Address">{(id) => <textarea id={id} value={form.address} maxLength={500} onChange={(ev) => setF({ ...form, address: ev.target.value })} />}</Field>
              <Field label="Emergency contact name">{(id) => <input id={id} type="text" value={form.emergency_contact_name} onChange={(ev) => setF({ ...form, emergency_contact_name: ev.target.value })} />}</Field>
              <Field label="Emergency contact phone">{(id) => <input id={id} type="tel" value={form.emergency_contact_phone} onChange={(ev) => setF({ ...form, emergency_contact_phone: ev.target.value })} />}</Field>
              <div><Button variant="primary" loading={busy} disabled={f === null} onClick={save}>Save</Button></div>
            </div>
          </Card>
          <Card title="Change password"><PasswordForm onDone={() => undefined} /></Card>
        </div>
      )}
    </>
  );
}
