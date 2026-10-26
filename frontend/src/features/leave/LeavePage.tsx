import { useState } from 'react';
import { api } from '../../api/client';
import { Holiday, LeaveBalance, LeaveRequest, Page } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, Card, Empty, ErrorNote, PageHead, Pager, Spinner, StatusBadge, Tabs } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { fmtDate, fmtDays, todayIso } from '../../utils/format';
import ApplyForm from './ApplyForm';
import LeaveCalendar from './LeaveCalendar';
import RequestDetail from './RequestDetail';

function Balances() {
  const res = useAsync(() => api.get<{ year: number; balances: LeaveBalance[] }>('/leave/balances/me'), []);
  const hol = useAsync(() => api.get<Holiday[]>('/policies/holidays', { year: Number(todayIso().slice(0, 4)) }), []);
  if (res.loading && !res.data) return <Spinner />;
  if (res.error || !res.data) return <ErrorNote message={res.error ?? 'Unavailable'} onRetry={res.reload} />;
  const upcoming = (hol.data ?? []).filter((h) => h.date >= todayIso()).slice(0, 6);
  return (
    <div className="stack">
      <div className="grid cols-4">
        {res.data.balances.filter((b) => b.tracked).map((b) => (
          <div key={b.leave_type_id} className="stat">
            <div className="l">{b.name} ({b.code})</div>
            <div className="v">{fmtDays(b.available)}<span className="muted small"> available</span></div>
            <div className="small muted">
              {fmtDays(b.allocated)} allocated · {fmtDays(b.used)} used{b.pending > 0 && ` · ${fmtDays(b.pending)} pending`}
              {b.adjusted !== 0 && ` · ${b.adjusted > 0 ? '+' : ''}${fmtDays(b.adjusted)} adjusted`}
            </div>
          </div>
        ))}
      </div>
      {res.data.balances.some((b) => !b.tracked) && (
        <p className="muted small">
          Also available without a balance: {res.data.balances.filter((b) => !b.tracked).map((b) => b.name).join(', ')}.
        </p>
      )}
      {upcoming.length > 0 && (
        <Card title="Upcoming holidays">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {upcoming.map((h) => <li key={h.id}>{fmtDate(h.date)} — {h.name}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function MyRequests({ onOpen, refreshKey }: { onOpen: (id: number) => void; refreshKey: number }) {
  const [offset, setOffset] = useState(0);
  const res = useAsync(() => api.get<Page<LeaveRequest>>('/leave/requests', { scope: 'mine', limit: 20, offset }), [offset, refreshKey]);
  if (res.loading && !res.data) return <Spinner />;
  if (res.error || !res.data) return <ErrorNote message={res.error ?? 'Unavailable'} onRetry={res.reload} />;
  return (
    <Card flush>
      {res.data.items.length === 0 ? <Empty>You have not applied for leave yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Applied</th></tr></thead>
            <tbody>
              {res.data.items.map((r) => (
                <tr key={r.id} className="click" tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(r.id)}>
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
  );
}

export default function LeavePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'overview' | 'requests' | 'calendar'>('overview');
  const [applying, setApplying] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [key, setKey] = useState(0);
  const bump = () => setKey((k) => k + 1);
  const manages = user!.role !== 'EMPLOYEE';

  return (
    <>
      <PageHead title="My leave" subtitle="Balances, applications and approval status."
        actions={<Button variant="primary" onClick={() => setApplying(true)}>Apply for leave</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Balances' }, { id: 'requests', label: 'My requests' }, { id: 'calendar', label: 'Calendar' },
      ]} />
      {tab === 'overview' && <Balances key={key} />}
      {tab === 'requests' && <MyRequests onOpen={setOpen} refreshKey={key} />}
      {tab === 'calendar' && <Card><LeaveCalendar showNames={manages} /></Card>}
      {applying && <ApplyForm onClose={() => setApplying(false)} onDone={() => { setApplying(false); setTab('requests'); bump(); }} />}
      {open !== null && <RequestDetail id={open} onClose={() => setOpen(null)} onChanged={bump} />}
    </>
  );
}
