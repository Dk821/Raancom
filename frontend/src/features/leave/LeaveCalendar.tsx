import { useState } from 'react';
import { api } from '../../api/client';
import { Button, ErrorNote, Spinner } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { monthLabel, shiftMonth, todayIso } from '../../utils/format';

interface Cal {
  leaves: { id: number; employee_name: string; leave_type: string; start_date: string; end_date: string; is_half_day: boolean; approved: boolean }[];
  holidays: { date: string; name: string }[];
}

export default function LeaveCalendar({ showNames }: { showNames?: boolean }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const res = useAsync(() => api.get<Cal>('/leave/calendar', { month }), [month]);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const today = todayIso();

  return (
    <div className="stack">
      <div className="row between">
        <strong>{monthLabel(month)}</strong>
        <div className="row">
          <Button small onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</Button>
          <Button small onClick={() => setMonth(todayIso().slice(0, 7))}>Today</Button>
          <Button small onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</Button>
        </div>
      </div>
      {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {res.loading && !res.data && <Spinner />}
      <div className="cal" role="grid" aria-label={`Leave calendar ${monthLabel(month)}`}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dow">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const hol = res.data?.holidays.find((h) => h.date === d);
          const lv = res.data?.leaves.filter((l) => l.start_date <= d && d <= l.end_date) ?? [];
          return (
            <div key={d} className={`day${d === today ? ' today' : ''}${hol ? ' off' : ''}`}>
              <strong>{Number(d.slice(8))}</strong>
              {hol && <span className="chip hol" title={hol.name}>{hol.name}</span>}
              {lv.slice(0, 3).map((l) => (
                <span key={l.id} className="chip" title={`${l.employee_name} — ${l.leave_type}${l.approved ? '' : ' (pending)'}`}
                  style={l.approved ? undefined : { opacity: 0.6, fontStyle: 'italic' }}>
                  {showNames ? l.employee_name.split(' ')[0] : l.leave_type}{l.is_half_day ? ' ½' : ''}
                </span>
              ))}
              {lv.length > 3 && <span className="small muted">+{lv.length - 3}</span>}
            </div>
          );
        })}
      </div>
      <p className="muted small">Italic entries are waiting for approval.</p>
    </div>
  );
}
