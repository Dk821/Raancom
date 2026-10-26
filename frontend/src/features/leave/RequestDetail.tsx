import { useState } from 'react';
import { api } from '../../api/client';
import { LeaveRequest } from '../../api/types';
import { Alert, Button, Field, Modal, Spinner, StatusBadge, ErrorNote, useToast } from '../../components/ui';
import { errMsg, useAsync } from '../../hooks/useAsync';
import { fmtDate, fmtDateTime, fmtDays, titleCase } from '../../utils/format';
import ApplyForm from './ApplyForm';

export default function RequestDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const res = useAsync(() => api.get<LeaveRequest>(`/leave/requests/${id}`), [id]);
  const [comment, setComment] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const r = res.data;

  const act = async (label: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.show(msg);
      setComment('');
      res.reload();
      onChanged();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const decide = (d: string, msg: string) =>
    act(d, () => api.post(`/leave/requests/${id}/decisions`, { decision: d, comments: comment }), msg);

  const openAttachment = async () => {
    try {
      const b = await api.blob(`/leave/requests/${id}/attachment`);
      window.open(URL.createObjectURL(b), '_blank', 'noopener');
    } catch (e) {
      toast.show(errMsg(e), 'error');
    }
  };

  if (editing && r) return <ApplyForm editing={r} onClose={() => setEditing(false)} onDone={() => { setEditing(false); res.reload(); onChanged(); }} />;

  const cancelling = r?.status === 'CANCELLATION_REQUESTED';
  return (
    <Modal title="Leave request" onClose={onClose} wide>
      {res.loading && !r && <Spinner />}
      {res.error && <ErrorNote message={res.error} />}
      {r && (
        <div className="stack">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="row between">
            <div>
              <h3>{r.employee.full_name} <span className="muted small">{r.employee.employee_code}</span></h3>
              <div className="muted small">{r.employee.department ?? ''}</div>
            </div>
            <StatusBadge status={r.status} />
          </div>
          <div className="form-grid">
            <div><div className="muted small">Leave type</div>{r.leave_type.name} ({r.leave_type.code})</div>
            <div><div className="muted small">Days charged</div>{fmtDays(r.days)}{r.is_half_day && ` (${titleCase(r.half_day_session ?? '')})`}</div>
            <div><div className="muted small">From</div>{fmtDate(r.start_date)}</div>
            <div><div className="muted small">To</div>{fmtDate(r.end_date)}</div>
            <div className="span-2"><div className="muted small">Reason</div>{r.reason}</div>
            {r.has_attachment && <div className="span-2"><Button small onClick={openAttachment}>Open attached document</Button></div>}
          </div>

          <div>
            <h3 style={{ marginBottom: 8 }}>History</h3>
            <ul className="timeline">
              {r.history?.map((h) => (
                <li key={h.id}>
                  <strong>{titleCase(h.action)}</strong> <span className="muted small">· {h.actor_name ?? 'System'} ({titleCase(h.step)}) · {fmtDateTime(h.created_at)}</span>
                  {h.comments && <div className="small">“{h.comments}”</div>}
                </li>
              ))}
            </ul>
          </div>

          {r.can_decide && (
            <div className="stack card" style={{ background: 'var(--surface-2)' }}>
              <Field label={cancelling ? 'Comment (required to keep the leave)' : 'Comment (required to reject or return)'}>
                {(fid) => <textarea id={fid} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />}
              </Field>
              <div className="row">
                <Button variant="primary" loading={busy === 'APPROVE'} onClick={() => decide('APPROVE', cancelling ? 'Cancellation approved' : 'Request approved')}>
                  {cancelling ? 'Approve cancellation' : 'Approve'}
                </Button>
                {!cancelling && (
                  <Button loading={busy === 'RETURN'} disabled={comment.trim().length < 3} onClick={() => decide('RETURN', 'Returned for changes')}>
                    Return for changes
                  </Button>
                )}
                <Button variant="danger" loading={busy === 'REJECT'} disabled={comment.trim().length < 3}
                  onClick={() => decide('REJECT', cancelling ? 'Leave kept' : 'Request rejected')}>
                  {cancelling ? 'Keep the leave (reject)' : 'Reject'}
                </Button>
              </div>
            </div>
          )}

          {(r.can_edit || r.can_cancel) && (
            <div className="stack">
              {r.can_cancel && r.status === 'APPROVED' && (
                <Field label="Reason for cancelling this approved leave">
                  {(fid) => <input id={fid} type="text" value={cancelReason} maxLength={500} onChange={(e) => setCancelReason(e.target.value)} />}
                </Field>
              )}
              <div className="row">
                {r.can_edit && <Button onClick={() => setEditing(true)}>{r.status === 'NEEDS_CHANGES' ? 'Edit & resubmit' : 'Edit'}</Button>}
                {r.can_cancel && (
                  <Button variant="danger" loading={busy === 'cancel'}
                    disabled={r.status === 'APPROVED' && cancelReason.trim().length < 3}
                    onClick={() => act('cancel', () => api.post(`/leave/requests/${id}/cancel`, { reason: cancelReason }),
                      r.status === 'APPROVED' ? 'Cancellation processed' : 'Request withdrawn')}>
                    {r.status === 'APPROVED' ? 'Cancel approved leave' : 'Withdraw request'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
