import { useState } from 'react';
import { api } from '../../api/client';
import { AttEvent, Correction, DayRow, Mode, Summary, TodayState } from '../../api/types';
import CameraCapture from '../../components/CameraCapture';
import PhotoThumb from '../../components/PhotoThumb';
import {
  Alert, Badge, Button, Card, Empty, ErrorNote, Field, PageHead, Spinner, Stat, StatusBadge, useToast,
} from '../../components/ui';
import { errMsg, useAsync } from '../../hooks/useAsync';
import {
  MODE_LABEL, fmtDate, fmtMinutes, fmtTime, fmtWeekday, monthLabel, monthRange, shiftMonth, todayIso,
} from '../../utils/format';
import { getPosition } from '../../utils/geo';
import CorrectionForm from './CorrectionForm';
import EventLine from './EventLine';

function PunchPanel({ today, onDone }: { today: TodayState; onDone: () => void }) {
  const toast = useToast();
  const kind = today.can_check_out ? 'CHECK_OUT' : 'CHECK_IN';
  const [mode, setMode] = useState<Mode>('OFFICE');
  const [remark, setRemark] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const needsRemark = mode !== 'OFFICE';

  const submit = async () => {
    if (!photo) return;
    setBusy(true);
    setError(null);
    setNote('Getting your location…');
    try {
      const { position, problem } = await getPosition();
      setNote(problem);
      const fd = new FormData();
      fd.set('event_type', kind);
      fd.set('mode', mode);
      if (position) {
        fd.set('latitude', String(position.latitude));
        fd.set('longitude', String(position.longitude));
        fd.set('accuracy_m', String(Math.round(position.accuracy)));
      }
      if (remark.trim()) fd.set('remark', remark.trim());
      fd.set('photo', photo, 'attendance.jpg');
      const res = await api.upload<{ event: AttEvent }>('/attendance/events', fd);
      toast.show(
        res.event.review_status === 'FLAGGED'
          ? `${kind === 'CHECK_IN' ? 'Checked in' : 'Checked out'} — sent for review`
          : kind === 'CHECK_IN' ? 'Checked in' : 'Checked out',
      );
      setPhoto(null);
      setRemark('');
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h3>{kind === 'CHECK_IN' ? 'Check in' : 'Check out'}</h3>
      {error && <Alert tone="error">{error}</Alert>}
      {note && <Alert tone="warn">{note}</Alert>}
      <div>
        <div className="label" style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>Where are you working from?</div>
        <div className="mode-pick" role="radiogroup" aria-label="Attendance mode">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <label key={m} className={mode === m ? 'on' : ''}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>
      </div>
      {mode === 'OFFICE' && today.offices.length === 0 && (
        <Alert tone="warn">No office location is set up yet. Ask the Owner to add one before using Office attendance.</Alert>
      )}
      {mode === 'OFFICE' && today.offices.length > 0 && (
        <p className="muted small">Office attendance is checked against {today.offices.map((o) => `${o.name} (${o.radius_m} m)`).join(', ')}.</p>
      )}
      {needsRemark && (
        <Field label={mode === 'WFH' ? 'Remark (required)' : 'Work purpose (required)'}
          hint={mode === 'WFH' ? 'e.g. Working on the Q4 report from home' : 'e.g. Client site visit at …'}>
          {(id) => <textarea id={id} value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={1000} />}
        </Field>
      )}
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 6 }}>Photo (required)</div>
        <CameraCapture onChange={setPhoto} />
      </div>
      <p className="muted small">
        Your photo, time and location are collected only to record attendance and are visible to you, your manager and HR.
      </p>
      <div>
        <Button variant="primary" loading={busy} onClick={submit}
          disabled={!photo || (needsRemark && remark.trim().length < 3)}>
          {kind === 'CHECK_IN' ? 'Check in now' : 'Check out now'}
        </Button>
      </div>
    </div>
  );
}

function TodayCard() {
  const t = useAsync(() => api.get<TodayState>('/attendance/today'), []);
  if (t.loading && !t.data) return <Card title="Today"><Spinner /></Card>;
  if (t.error || !t.data) return <Card title="Today"><ErrorNote message={t.error ?? 'Unavailable'} onRetry={t.reload} /></Card>;
  const d = t.data;
  return (
    <Card title={`Today · ${fmtDate(d.date)}`} actions={d.day && <StatusBadge status={d.day.status} />}>
      <div className="stack">
        {d.check_in && <EventLine ev={d.check_in} title="Checked in" />}
        {d.check_out && <EventLine ev={d.check_out} title="Checked out" />}
        {d.day?.late && <Alert tone="warn">Marked late by {d.day.late_minutes} min.</Alert>}
        {d.state === 'COMPLETED' && d.day?.worked_minutes !== null && (
          <Alert tone="ok">Day complete — {fmtMinutes(d.day?.worked_minutes)} worked. See you tomorrow!</Alert>
        )}
        {d.state === 'STALE' && (
          <Alert tone="warn">Your check-in is too old to check out. Send a correction request below and your manager will review it.</Alert>
        )}
        {(d.can_check_in || d.can_check_out) && <PunchPanel today={d} onDone={t.reload} />}
      </div>
    </Card>
  );
}

export default function AttendancePage() {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const { from, to } = monthRange(month);
  const hist = useAsync(() => api.get<{ rows: DayRow[]; summary: Summary }>('/attendance/me', { from, to }), [month]);
  const corr = useAsync(() => api.get<Correction[]>('/attendance/corrections', { scope: 'mine' }), []);
  const [fix, setFix] = useState<string | null>(null);
  const isCurrent = month === todayIso().slice(0, 7);

  return (
    <>
      <PageHead title="My attendance" subtitle="Check in and out, and review your history." />
      <div className="stack">
        <TodayCard />

        <Card title="History" actions={
          <div className="row">
            <Button small onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</Button>
            <strong style={{ minWidth: 130, textAlign: 'center' }}>{monthLabel(month)}</strong>
            <Button small disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</Button>
          </div>}>
          {hist.loading && !hist.data && <Spinner />}
          {hist.error && <ErrorNote message={hist.error} onRetry={hist.reload} />}
          {hist.data && (
            <>
              <div className="grid cols-4 stats" style={{ marginBottom: 14 }}>
                <Stat value={hist.data.summary.present} label="Present" tone="ok" />
                <Stat value={hist.data.summary.half_day} label="Half days" />
                <Stat value={hist.data.summary.absent} label="Absent" tone={hist.data.summary.absent ? 'bad' : undefined} />
                <Stat value={hist.data.summary.late_count} label="Late arrivals" tone={hist.data.summary.late_count ? 'warn' : undefined} />
                <Stat value={hist.data.summary.leave} label="Leave days" />
                <Stat value={hist.data.summary.incomplete} label="Incomplete" tone={hist.data.summary.incomplete ? 'bad' : undefined} />
                <Stat value={fmtMinutes(hist.data.summary.worked_minutes)} label="Hours worked" />
                <Stat value={hist.data.summary.payable_days} label="Payable days" />
              </div>
              {hist.data.rows.length === 0 ? <Empty>No days to show for this month yet.</Empty> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th>Worked</th><th>Mode</th><th /></tr></thead>
                    <tbody>
                      {hist.data.rows.map((r) => (
                        <tr key={r.date}>
                          <td className="nowrap">{fmtWeekday(r.date)}, {fmtDate(r.date)}</td>
                          <td>
                            <StatusBadge status={r.status} />{' '}
                            {r.late && <Badge tone="warn">Late {r.late_minutes}m</Badge>}{' '}
                            {r.corrected && <Badge tone="info">Corrected</Badge>}
                            {r.holiday && <span className="small muted"> {r.holiday}</span>}
                            {r.leave_type && <span className="small muted"> {r.leave_type}</span>}
                          </td>
                          <td>{fmtTime(r.check_in)}</td>
                          <td>{fmtTime(r.check_out)}</td>
                          <td>{fmtMinutes(r.worked_minutes)}</td>
                          <td>{r.mode ? MODE_LABEL[r.mode] : '—'}</td>
                          <td className="right">
                            {!['HOLIDAY', 'WEEKLY_OFF', 'NOT_MARKED', 'CHECKED_IN'].includes(r.status) || r.check_in ? (
                              <Button small variant="ghost" onClick={() => setFix(r.date)}>Request correction</Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>

        <Card title="My correction requests">
          {corr.loading && !corr.data && <Spinner />}
          {corr.data && corr.data.length === 0 && <Empty>No correction requests.</Empty>}
          {corr.data && corr.data.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Reason</th><th>Status</th><th>Decision</th></tr></thead>
                <tbody>
                  {corr.data.map((c) => (
                    <tr key={c.id}>
                      <td className="nowrap">{fmtDate(c.attendance_date)}</td>
                      <td>{c.reason}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="small">{c.decision_reason ?? '—'}{c.reviewer_name && <div className="muted">by {c.reviewer_name}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {fix && <CorrectionForm defaultDate={fix} onClose={() => setFix(null)} onDone={() => { setFix(null); corr.reload(); hist.reload(); }} />}
    </>
  );
}
