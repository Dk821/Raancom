import { useState } from 'react';
import { api } from '../../api/client';
import { Alert, Button, Field, Modal, useToast } from '../../components/ui';
import { errMsg } from '../../hooks/useAsync';
import { todayIso, zonedToIso } from '../../utils/format';

interface Props {
  defaultDate?: string;
  /** HR/Owner correcting someone else's day directly. */
  employee?: { id: number; name: string };
  onClose: () => void;
  onDone: () => void;
}

export default function CorrectionForm({ defaultDate, employee, onClose, onDone }: Props) {
  const toast = useToast();
  const [date, setDate] = useState(defaultDate ?? todayIso());
  const [inTime, setIn] = useState('');
  const [outTime, setOut] = useState('');
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const outDate = outTime && inTime && outTime < inTime ? nextDay(date) : date; // overnight shift
      await api.post('/attendance/corrections', {
        attendance_date: date,
        requested_check_in: inTime ? zonedToIso(date, inTime) : null,
        requested_check_out: outTime ? zonedToIso(outDate, outTime) : null,
        requested_status: status || null,
        reason,
        employee_id: employee?.id ?? null,
      });
      toast.show(employee ? 'Attendance corrected' : 'Correction request sent');
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={employee ? `Correct attendance — ${employee.name}` : 'Request attendance correction'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}
            disabled={reason.trim().length < 5 || (!inTime && !outTime && !status)}>
            {employee ? 'Save correction' : 'Send request'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="error">{error}</Alert>}
        {employee && <Alert tone="info">This is applied immediately and recorded in the audit log. The original punches stay on file.</Alert>}
        <div className="form-grid">
          <Field label="Date" className="span-2">
            {(id) => <input id={id} type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Correct check-in time" hint="Leave blank to keep the recorded time">
            {(id) => <input id={id} type="time" value={inTime} onChange={(e) => setIn(e.target.value)} />}
          </Field>
          <Field label="Correct check-out time" hint="Leave blank to keep the recorded time">
            {(id) => <input id={id} type="time" value={outTime} onChange={(e) => setOut(e.target.value)} />}
          </Field>
          <Field label="Or set the day's status" className="span-2">
            {(id) => (
              <select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Don't change</option>
                <option value="PRESENT">Present</option>
                <option value="HALF_DAY">Half day</option>
                <option value="ABSENT">Absent</option>
              </select>
            )}
          </Field>
          <Field label="Reason" className="span-2" hint="Explain what happened. The reviewer sees this.">
            {(id) => <textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />}
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function nextDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
}
