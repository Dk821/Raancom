import { useState } from 'react';
import { api } from '../../api/client';
import { Correction, LeaveRequest, Page } from '../../api/types';
import {
  Alert, Button, Card, Empty, ErrorNote, Field, Modal, PageHead, Pager, Spinner, StatusBadge, Tabs, useToast,
} from '../../components/ui';
import { errMsg, useAsync } from '../../hooks/useAsync';
import { fmtDate, fmtDateTime, fmtDays, fmtTime } from '../../utils/format';
import LeaveCalendar from './LeaveCalendar';
import RequestDetail from './RequestDetail';

function LeaveList({ scope, onOpen, refreshKey }: { scope: 'pending' | 'team'; onOpen: (id: number) => void; refreshKey: number }) {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('');
  const res = useAsync(
    () => api.get<Page<LeaveRequest>>('/leave/requests', { scope, limit: 25, offset, status: scope === 'team' ? status : '' }),
    [scope, offset, status, refreshKey],
  );
  return (
    <>
      {scope === 'team' && (
        <div className="filters">
          <Field label="Status">
            {(id) => (
              <select id={id} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
                <option value="">Any</option>
                {['PENDING_MANAGER', 'PENDING_HR', 'NEEDS_CHANGES', 'APPROVED', 'REJECTED', 'CANCELLATION_REQUESTED', 'CANCELLED'].map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
      )}
      {res.loading && !res.data && <Spinner />}
      {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {res.data && (
        <Card flush>
          {res.data.items.length === 0 ? <Empty>{scope === 'pending' ? 'Nothing is waiting for your decision.' : 'No requests found.'}</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Applied</th></tr></thead>
                <tbody>
                  {res.data.items.map((r) => (
                    <tr key={r.id} className="click" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(r.id)}>
                      <td>{r.employee.full_name}<div className="small muted">{r.employee.department ?? ''}</div></td>
                      <td>{r.leave_type.code}</td>
                      <td className="nowrap">{fmtDate(r.start_date)}{r.end_date !== r.start_date && ` – ${fmtDate(r.end_date)}`}</td>
                      <td>{fmtDays(r.days)}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="nowrap">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager total={res.data.total} limit={res.data.limit} offset={offset} onChange={setOffset} />
        </Card>
      )}
    </>
  );
}

function CorrectionReview({ c, onClose, onDone }: { c: Correction; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    setBusy(decision);
    setError(null);
    try {
      await api.post(`/attendance/corrections/${c.id}/review`, { decision, reason });
      toast.show(decision === 'APPROVED' ? 'Correction approved' : 'Correction rejected');
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal title="Attendance correction" onClose={onClose}>
      <div className="stack">
        {error && <Alert tone="error">{error}</Alert>}
        <div><strong>{c.employee_name}</strong> <span className="muted small">{c.employee_code}</span></div>
        <div className="form-grid">
          <div><div className="muted small">Date</div>{fmtDate(c.attendance_date)}</div>
          <div><div className="muted small">Requested on</div>{fmtDateTime(c.created_at)}</div>
          <div><div className="muted small">Check-in</div>{c.requested_check_in ? fmtTime(c.requested_check_in) : 'unchanged'}</div>
          <div><div className="muted small">Check-out</div>{c.requested_check_out ? fmtTime(c.requested_check_out) : 'unchanged'}</div>
          {c.requested_status && <div className="span-2"><div className="muted small">Status</div>{c.requested_status.replace('_', ' ')}</div>}
          <div className="span-2"><div className="muted small">Reason given</div>{c.reason}</div>
        </div>
        {c.status === 'PENDING' ? (
          <>
            <Field label="Decision comment (required to reject)">
              {(id) => <textarea id={id} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />}
            </Field>
            <div className="row">
              <Button variant="primary" loading={busy === 'APPROVED'} onClick={() => decide('APPROVED')}>Approve</Button>
              <Button variant="danger" loading={busy === 'REJECTED'} disabled={reason.trim().length < 3} onClick={() => decide('REJECTED')}>Reject</Button>
            </div>
          </>
        ) : (
          <Alert tone="info"><StatusBadge status={c.status} /> by {c.reviewer_name ?? '—'} {c.decision_reason && `— “${c.decision_reason}”`}</Alert>
        )}
      </div>
    </Modal>
  );
}

function Corrections({ scope, refreshKey, onChanged }: { scope: 'pending' | 'team'; refreshKey: number; onChanged: () => void }) {
  const res = useAsync(() => api.get<Correction[]>('/attendance/corrections', { scope }), [scope, refreshKey]);
  const [open, setOpen] = useState<Correction | null>(null);
  if (res.loading && !res.data) return <Spinner />;
  if (res.error || !res.data) return <ErrorNote message={res.error ?? 'Unavailable'} onRetry={res.reload} />;
  return (
    <>
      <Card flush>
        {res.data.length === 0 ? <Empty>No correction requests.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Date</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {res.data.map((c) => (
                  <tr key={c.id} className="click" tabIndex={0} onClick={() => setOpen(c)} onKeyDown={(e) => e.key === 'Enter' && setOpen(c)}>
                    <td>{c.employee_name}</td>
                    <td className="nowrap">{fmtDate(c.attendance_date)}</td>
                    <td>{c.reason}</td>
                    <td><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <CorrectionReview c={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); res.reload(); onChanged(); }} />}
    </>
  );
}

export default function ApprovalsPage() {
  const [tab, setTab] = useState<'leave' | 'corrections' | 'history' | 'calendar'>('leave');
  const [open, setOpen] = useState<number | null>(null);
  const [key, setKey] = useState(0);
  const bump = () => setKey((k) => k + 1);
  const pendLeave = useAsync(() => api.get<Page<LeaveRequest>>('/leave/requests', { scope: 'pending', limit: 1 }), [key]);
  const pendCorr = useAsync(() => api.get<Correction[]>('/attendance/corrections', { scope: 'pending' }).catch(() => [] as Correction[]), [key]);
  return (
    <>
      <PageHead title="Approvals" subtitle="Leave requests and attendance corrections waiting for you." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'leave', label: 'Leave requests', badge: pendLeave.data?.total },
        { id: 'corrections', label: 'Attendance corrections', badge: pendCorr.data?.length },
        { id: 'history', label: 'All team leave' },
        { id: 'calendar', label: 'Team calendar' },
      ]} />
      {tab === 'leave' && <LeaveList scope="pending" onOpen={setOpen} refreshKey={key} />}
      {tab === 'corrections' && <Corrections scope="team" refreshKey={key} onChanged={bump} />}
      {tab === 'history' && <LeaveList scope="team" onOpen={setOpen} refreshKey={key} />}
      {tab === 'calendar' && <Card><LeaveCalendar showNames /></Card>}
      {open !== null && <RequestDetail id={open} onClose={() => setOpen(null)} onChanged={bump} />}
    </>
  );
}
