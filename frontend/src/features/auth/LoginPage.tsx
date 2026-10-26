import { FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Button, Field } from '../../components/ui';
import { errMsg } from '../../hooks/useAsync';

export default function LoginPage() {
  const { user, login } = useAuth();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={user.must_change_password ? '/change-password' : loc.state?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card stack" onSubmit={submit} noValidate>
        <div className="row">
          <span className="brand-mark" style={{ width: 40, height: 40, color: '#fff' }}>R</span>
          <div>
            <h1 style={{ fontSize: '1.3rem' }}>Raancom</h1>
            <span className="muted small">Employee management &amp; attendance</span>
          </div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email">
          {(id) => <input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
        </Field>
        <Field label="Password">
          {(id) => <input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button variant="primary" type="submit" loading={busy} disabled={!email || !password}>Sign in</Button>
        <p className="muted small">Forgot your password? Ask HR or the Owner to reset it for you.</p>
      </form>
    </div>
  );
}
