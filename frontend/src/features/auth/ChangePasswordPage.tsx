import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Button, Field, useToast } from '../../components/ui';
import { errMsg } from '../../hooks/useAsync';

export function PasswordForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = again.length > 0 && again !== next;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) return setError('The new passwords do not match');
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: next });
      toast.show('Password changed');
      setCurrent(''); setNext(''); setAgain('');
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Current password">
        {(id) => <input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
      </Field>
      <Field label="New password" hint="At least 10 characters, with letters and numbers.">
        {(id) => <input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />}
      </Field>
      <Field label="Repeat new password" error={mismatch ? 'Passwords do not match' : null}>
        {(id) => <input id={id} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />}
      </Field>
      <div><Button variant="primary" type="submit" loading={busy} disabled={!current || next.length < 10 || mismatch}>Change password</Button></div>
    </form>
  );
}

export default function ChangePasswordPage() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="login-wrap">
      <div className="card login-card stack">
        <h1 style={{ fontSize: '1.3rem' }}>Set a new password</h1>
        <p className="muted">
          {user?.must_change_password
            ? 'For security, choose your own password before continuing.'
            : 'Choose a new password.'}
        </p>
        <PasswordForm onDone={async () => { await refresh(); nav('/', { replace: true }); }} />
        <Button variant="ghost" onClick={logout}>Sign out</Button>
      </div>
    </div>
  );
}

