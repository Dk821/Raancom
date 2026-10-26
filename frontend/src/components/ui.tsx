import {
  ButtonHTMLAttributes, ReactNode, createContext, useCallback, useContext, useEffect, useId, useRef, useState,
} from 'react';
import { Link } from 'react-router-dom';
import { titleCase } from '../utils/format';

/* ---------- Button ---------- */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'ghost' | 'default';
  small?: boolean;
  loading?: boolean;
  icon?: boolean;
}
export function Button({ variant = 'default', small, icon, loading, children, disabled, className = '', ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'default' ? variant : '', small ? 'sm' : '', icon ? 'icon' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden />}
      {children}
    </button>
  );
}

/* ---------- Layout bits ---------- */
export function Card({ title, actions, children, flush }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className={`card${flush ? ' flush' : ''}`}>
      {(title || actions) && (
        <div className="row between" style={{ marginBottom: 12, padding: flush ? '16px 18px 0' : 0 }}>
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Stat({ value, label, to, tone }: { value: ReactNode; label: string; to?: string; tone?: 'bad' | 'warn' | 'ok' }) {
  const color = tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--ok)' : undefined;
  const inner = (
    <>
      <div className="v" style={{ color }}>{value}</div>
      <div className="l">{label}</div>
    </>
  );
  return to ? <Link className="stat" to={to}>{inner}</Link> : <div className="stat">{inner}</div>;
}

export function Spinner() {
  return <div className="center"><span className="spinner" role="status" aria-label="Loading" /></div>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert error row between" role="alert">
      <span>{message}</span>
      {onRetry && <Button small onClick={onRetry}>Retry</Button>}
    </div>
  );
}
export function Alert({ tone = 'info', children }: { tone?: 'error' | 'warn' | 'ok' | 'info'; children: ReactNode }) {
  return <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : undefined}>{children}</div>;
}

/* ---------- Badges ---------- */
type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'brand' | '';
export function Badge({ tone = '', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  PRESENT: 'ok', APPROVED: 'ok', ACTIVE: 'ok', OK: 'ok', INSIDE: 'ok', REVIEWED: 'info',
  HALF_DAY: 'warn', PENDING: 'warn', PENDING_MANAGER: 'warn', PENDING_HR: 'warn', CHECKED_IN: 'info',
  NEEDS_CHANGES: 'warn', CANCELLATION_REQUESTED: 'warn', FLAGGED: 'warn', LOW_ACCURACY: 'warn', NO_LOCATION: 'warn',
  ABSENT: 'bad', REJECTED: 'bad', INCOMPLETE: 'bad', INACTIVE: 'bad', OUTSIDE: 'bad',
  LEAVE: 'info', HOLIDAY: 'brand', WEEKLY_OFF: '', NOT_MARKED: '', CANCELLED: '', NOT_APPLICABLE: '',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING_MANAGER: 'Awaiting manager', PENDING_HR: 'Awaiting HR', NEEDS_CHANGES: 'Returned for changes',
  CANCELLATION_REQUESTED: 'Cancellation requested', CHECKED_IN: 'Checked in', NOT_MARKED: 'Not marked',
  WEEKLY_OFF: 'Weekly off', HALF_DAY: 'Half day',
};
export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <>—</>;
  return <Badge tone={STATUS_TONE[status] ?? ''}>{STATUS_LABEL[status] ?? titleCase(status)}</Badge>;
}

/* ---------- Form helpers ---------- */
export function Field({ label, hint, error, children, className = '' }: {
  label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; className?: string;
}) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}

export function Check({ checked, onChange, children, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <Button variant="ghost" icon small onClick={onClose} aria-label="Close">✕</Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (t: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab${value === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}>
          {t.label}{t.badge ? <> <Badge tone="warn">{t.badge}</Badge></> : null}
        </button>
      ))}
    </div>
  );
}

/* ---------- Toasts ---------- */
interface ToastApi { show: (msg: string, kind?: 'ok' | 'error') => void }
const ToastCtx = createContext<ToastApi>({ show: () => undefined });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const show = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((i) => <div key={i.id} className={`toast ${i.kind}`}>{i.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Copyable secret (temporary passwords) ---------- */
export function Secret({ value }: { value: string }) {
  const toast = useToast();
  return (
    <div className="row">
      <div className="secret grow">{value}</div>
      <Button small onClick={() => navigator.clipboard?.writeText(value).then(() => toast.show('Copied'), () => toast.show('Copy failed', 'error'))}>
        Copy
      </Button>
    </div>
  );
}

/* ---------- Pagination ---------- */
export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (o: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="row between" style={{ padding: 12 }}>
      <span className="muted small">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <div className="row">
        <Button small disabled={page <= 1} onClick={() => onChange(offset - limit)}>Previous</Button>
        <span className="small">Page {page} / {pages}</span>
        <Button small disabled={page >= pages} onClick={() => onChange(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}
