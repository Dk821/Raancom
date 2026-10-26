import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { LeaveRequest, LeaveType } from '../../api/types';
import { Alert, Button, Check, Field, Modal, useToast } from '../../components/ui';
import { errMsg, useAsync } from '../../hooks/useAsync';
import { fmtDays, todayIso } from '../../utils/format';

interface Estimate { ok: boolean; error?: string; days?: number; available?: Record<string, number>; warnings?: string[] }

export default function ApplyForm({ editing, onClose, onDone }: { editing?: LeaveRequest; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const types = useAsync(() => api.get<LeaveType[]>('/leave/types'), []);
  const [typeId, setTypeId] = useState<number | ''>(editing?.leave_type.id ?? '');
  const [start, setStart] = useState(editing?.start_date ?? todayIso());
  const [end, setEnd] = useState(editing?.end_date ?? todayIso());
  const [half, setHalf] = useState(editing?.is_half_day ?? false);
  const [session, setSession] = useState(editing?.half_day_session ?? 'FIRST_HALF');
  const [reason, setReason] = useState(editing?.reason ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = types.data?.find((t) => t.id === typeId);
  useEffect(() => {
    if (!typeId && types.data?.length) setTypeId(types.data[0].id);
  }, [types.data, typeId]);
  useEffect(() => {
    if (type && !type.allows_half_day) setHalf(false);
  }, [type]);
  useEffect(() => {
    if (half) setEnd(start);
  }, [half, start]);

  // Live estimate: days that will be charged and the remaining balance.
  useEffect(() => {
    if (!typeId || !start || !end) return;
    let stale = false;
    const t = setTimeout(() => {
      api.post<Estimate>('/leave/estimate', {
        leave_type_id: typeId, start_date: start, end_date: end, is_half_day: half,
        half_day_session: half ? session : null, exclude_request_id: editing?.id ?? null,
      }).then((r) => !stale && setEst(r)).catch(() => !stale && setEst(null));
    }, 250);
    return () => { stale = true; clearTimeout(t); };
  }, [typeId, start, end, half, session, editing?.id]);

  const submit = async () => {
    if (!typeId) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.patch(`/leave/requests/${editing.id}`, {
          leave_type_id: typeId, start_date: start, end_date: end, reason, is_half_day: half,
          half_day_session: half ? session : null,
        });
        if (file) {
          const fd = new FormData();
          fd.set('attachment', file);
          await api.upload(`/leave/requests/${editing.id}/attachment`, fd);
        }
        toast.show(editing.status === 'NEEDS_CHANGES' ? 'Resubmitted for approval' : 'Request updated');
      } else {
        const fd = new FormData();
        fd.set('leave_type_id', String(typeId));
        fd.set('start_date', start);
        fd.set('end_date', end);
        fd.set('reason', reason);
        fd.set('is_half_day', String(half));
        if (half) fd.set('half_day_session', session);
        if (file) fd.set('attachment', file);
        await api.upload('/leave/requests', fd);
        toast.show('Leave request submitted');
      }
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const needsFile = !!type?.requires_attachment && !(editing?.has_attachment) && !file;
  const blocked = !typeId || reason.trim().length < 3 || needsFile || (est !== null && !est.ok);

  return (
    <Modal title={editing ? 'Edit leave request' : 'Apply for leave'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={blocked} onClick={submit}>
          {editing?.status === 'NEEDS_CHANGES' ? 'Resubmit' : editing ? 'Save changes' : 'Submit request'}
        </Button></>}>
      <div className="stack">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-grid">
          <Field label="Leave type" className="span-2">
            {(id) => (
              <select id={id} value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
                {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
              </select>
            )}
          </Field>
          <Field label="From">{(id) => <input id={id} type="date" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />}</Field>
          <Field label="To">{(id) => <input id={id} type="date" value={end} min={start} disabled={half} onChange={(e) => setEnd(e.target.value)} />}</Field>
          {type?.allows_half_day && (
            <div className="span-2 row">
              <Check checked={half} onChange={setHalf}>Half day</Check>
              {half && (
                <select aria-label="Which half" value={session} onChange={(e) => setSession(e.target.value)} style={{ width: 'auto' }}>
                  <option value="FIRST_HALF">First half</option>
                  <option value="SECOND_HALF">Second half</option>
                </select>
              )}
            </div>
          )}
          <Field label="Reason" className="span-2">
            {(id) => <textarea id={id} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Field label={`Supporting document${type?.requires_attachment ? ' (required)' : ' (optional)'}`} className="span-2"
            hint="PDF or image, up to 5 MB. Only your manager, HR and the Owner can open it.">
            {(id) => <input id={id} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
          </Field>
        </div>
        {est && (est.ok ? (
          <Alert tone={est.warnings?.length ? 'warn' : 'info'}>
            <strong>{fmtDays(est.days ?? 0)} day(s)</strong> will be charged
            {type?.balance_required && est.available && Object.entries(est.available).map(([y, a]) => (
              <span key={y}> · {fmtDays(a)} available in {y}</span>
            ))}
            {est.warnings?.map((w) => <div key={w}>{w}</div>)}
            <div className="small">Weekly offs and holidays are not charged unless company policy says so.</div>
          </Alert>
        ) : <Alert tone="error">{est.error}</Alert>)}
      </div>
    </Modal>
  );
}
