import { useState } from 'react';
import { api } from '../../api/client';
import {
  IconCalendarDays,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconXmark,
} from '../../components/icons';
import { Badge, Button, Empty, ErrorNote, Spinner } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { fmtDate, monthLabel, shiftMonth, todayIso } from '../../utils/format';

interface CalLeave {
  id: number;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  approved: boolean;
  status?: string;
}

interface CalHoliday {
  date: string;
  name: string;
  holiday_type?: string;
}

interface Cal {
  leaves: CalLeave[];
  holidays: CalHoliday[];
}

export default function LeaveCalendar({ showNames }: { showNames?: boolean }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const res = useAsync(() => api.get<Cal>('/leave/calendar', { month }), [month]);

  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid (0 = Mon, 6 = Sun)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  // Full calendar grid including lead blanks and trailing blanks for a uniform 7-column layout
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
    ...Array(totalCells - (lead + daysInMonth)).fill(null),
  ];

  const today = todayIso();
  const currentMonth = today.slice(0, 7);

  const leaves = res.data?.leaves ?? [];
  const holidays = res.data?.holidays ?? [];

  const approvedLeavesCount = leaves.filter((l) => l.approved).length;
  const pendingLeavesCount = leaves.filter((l) => !l.approved).length;
  const holidaysCount = holidays.length;

  const selectedDayHolidays = selectedDate ? holidays.filter((h) => h.date === selectedDate) : [];
  const selectedDayLeaves = selectedDate
    ? leaves.filter((l) => l.start_date <= selectedDate && selectedDate <= l.end_date)
    : [];

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* ── Toolbar Header ────────────────────────────────────────────── */}
      <div className="cal-toolbar">
        <div className="cal-title-group">
          <h2>{monthLabel(month)}</h2>
          <div className="cal-nav-btns">
            <Button
              small
              icon
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="Previous month"
              title="Previous month"
            >
              <IconChevronLeft size={12} />
            </Button>
            <Button
              small
              variant={month === currentMonth ? 'primary' : 'default'}
              onClick={() => setMonth(currentMonth)}
              title="Go to current month"
            >
              Today
            </Button>
            <Button
              small
              icon
              onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label="Next month"
              title="Next month"
            >
              <IconChevronRight size={12} />
            </Button>
          </div>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            style={{ width: 'auto', minHeight: 32, padding: '4px 8px', fontSize: '0.82rem' }}
            title="Jump to month"
          />
        </div>

        {/* Live Monthly Stats */}
        <div className="cal-stats">
          <span className="cal-stat-pill" title="Total leaves approved this month">
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--ok)',
                display: 'inline-block',
              }}
            />
            <span>Leaves:</span> <strong>{approvedLeavesCount}</strong>
          </span>
          {pendingLeavesCount > 0 && (
            <span className="cal-stat-pill" title="Leaves waiting for approval">
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--warn)',
                  display: 'inline-block',
                }}
              />
              <span>Pending:</span> <strong>{pendingLeavesCount}</strong>
            </span>
          )}
          <span className="cal-stat-pill" title="Holidays in this month">
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--primary)',
                display: 'inline-block',
              }}
            />
            <span>Holidays:</span> <strong>{holidaysCount}</strong>
          </span>
        </div>
      </div>

      {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {res.loading && !res.data && <Spinner />}

      {/* ── Main Calendar Container ───────────────────────────────────── */}
      <div className="cal-wrap">
        {/* Weekday Names Header */}
        <div className="cal-dow-grid">
          {[
            { label: 'Mon', isWeekend: false },
            { label: 'Tue', isWeekend: false },
            { label: 'Wed', isWeekend: false },
            { label: 'Thu', isWeekend: false },
            { label: 'Fri', isWeekend: false },
            { label: 'Sat', isWeekend: true },
            { label: 'Sun', isWeekend: true },
          ].map((d) => (
            <div key={d.label} className={`cal-dow${d.isWeekend ? ' weekend' : ''}`}>
              {d.label}
            </div>
          ))}
        </div>

        {/* 7-Column Grid of Calendar Days */}
        <div className="cal-grid" role="grid" aria-label={`Leave calendar ${monthLabel(month)}`}>
          {cells.map((d, i) => {
            if (!d) {
              return <div key={`blank-${i}`} className="cal-cell blank" />;
            }

            const dayIndex = i % 7;
            const isWeekend = dayIndex === 5 || dayIndex === 6;
            const isToday = d === today;
            const dayHol = holidays.find((h) => h.date === d);
            const dayLeaves = leaves.filter((l) => l.start_date <= d && d <= l.end_date);
            const hasEvents = Boolean(dayHol || dayLeaves.length > 0);

            return (
              <div
                key={d}
                role="gridcell"
                tabIndex={0}
                onClick={() => setSelectedDate(d)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedDate(d)}
                className={[
                  'cal-cell',
                  'active-day',
                  isToday ? 'today' : '',
                  isWeekend ? 'weekend' : '',
                  dayHol ? 'off' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={`${d}${dayHol ? ` · Holiday: ${dayHol.name}` : ''}${
                  dayLeaves.length ? ` · ${dayLeaves.length} leave(s)` : ''
                } — Click to view details`}
              >
                {/* Cell Header: Day Number */}
                <div className="cal-cell-head">
                  <span className="cal-cell-num">{Number(d.slice(8))}</span>
                  {hasEvents && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: dayHol ? 'var(--primary)' : 'var(--ok)',
                      }}
                    />
                  )}
                </div>

                {/* Event Tags inside the cell */}
                <div className="cal-cell-tags">
                  {dayHol && (
                    <div className="cal-event holiday" title={`Holiday: ${dayHol.name}`}>
                      <IconCalendarDays size={11} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {dayHol.name}
                      </span>
                    </div>
                  )}

                  {dayLeaves.slice(0, dayHol ? 1 : 2).map((l) => {
                    const isAppr = l.approved;
                    return (
                      <div
                        key={l.id}
                        className={`cal-event ${isAppr ? 'leave-approved' : 'leave-pending'}`}
                        title={`${l.employee_name} (${l.leave_type})${
                          isAppr ? ' - Approved' : ' - Pending'
                        }`}
                      >
                        {isAppr ? (
                          <IconCircleCheck size={11} style={{ flexShrink: 0, color: 'var(--ok)' }} />
                        ) : (
                          <IconClock size={11} style={{ flexShrink: 0, color: 'var(--warn)' }} />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {showNames ? l.employee_name.split(' ')[0] : l.leave_type}
                          {l.is_half_day ? ' ½' : ''}
                        </span>
                      </div>
                    );
                  })}

                  {dayLeaves.length > (dayHol ? 1 : 2) && (
                    <span className="cal-event-more">
                      +{dayLeaves.length - (dayHol ? 1 : 2)} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Legend & Interactive Note ─────────────────────────────────── */}
      <div className="cal-legend-bar">
        <div className="cal-legend-items">
          <span className="cal-legend-pill">
            <span className="cal-legend-bullet" style={{ background: 'var(--ok)' }} />
            Approved Leave
          </span>
          <span className="cal-legend-pill">
            <span className="cal-legend-bullet" style={{ background: 'var(--warn)' }} />
            Pending Approval
          </span>
          <span className="cal-legend-pill">
            <span className="cal-legend-bullet" style={{ background: 'var(--primary)' }} />
            Company / Public Holiday
          </span>
          <span className="cal-legend-pill">
            <span
              className="cal-legend-bullet"
              style={{ background: 'var(--muted)', opacity: 0.6 }}
            />
            Weekend
          </span>
        </div>
        <span className="small muted">Click any day cell to view all scheduled events</span>
      </div>

      {/* ── Day Details Modal ─────────────────────────────────────────── */}
      {selectedDate && (
        <div
          className="modal-back"
          onClick={(e) => e.target === e.currentTarget && setSelectedDate(null)}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <IconCalendarDays size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0 }}>{fmtDate(selectedDate)}</h3>
                {selectedDate === today && <Badge tone="ok">Today</Badge>}
              </div>
              <button
                type="button"
                className="btn ghost sm icon"
                onClick={() => setSelectedDate(null)}
                aria-label="Close"
              >
                <IconXmark size={14} />
              </button>
            </div>

            <div className="modal-body stack" style={{ gap: 16 }}>
              {/* Holiday Info */}
              {selectedDayHolidays.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <h4 style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
                    HOLIDAY
                  </h4>
                  {selectedDayHolidays.map((h, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'var(--primary-soft)',
                        border: '1px solid var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <IconCalendarDays size={16} style={{ color: 'var(--primary)' }} />
                        <strong style={{ fontSize: '0.95rem' }}>{h.name}</strong>
                      </div>
                      <Badge tone="brand">
                        {(h.holiday_type || 'PUBLIC').toLowerCase()} holiday
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* Leaves on Date */}
              <div className="stack" style={{ gap: 8 }}>
                <h4 style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
                  SCHEDULED LEAVES ({selectedDayLeaves.length})
                </h4>
                {selectedDayLeaves.length === 0 ? (
                  <Empty>No employee leaves scheduled for this date.</Empty>
                ) : (
                  <div className="stack" style={{ gap: 8 }}>
                    {selectedDayLeaves.map((l) => (
                      <div
                        key={l.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                            {showNames ? l.employee_name : 'Your Leave'}
                          </div>
                          <div className="small muted" style={{ marginTop: 2 }}>
                            Type: <strong>{l.leave_type}</strong>
                            {l.is_half_day ? ' (Half Day)' : ' (Full Day)'} · Range:{' '}
                            {fmtDate(l.start_date)}
                            {l.end_date !== l.start_date ? ` – ${fmtDate(l.end_date)}` : ''}
                          </div>
                        </div>
                        <Badge tone={l.approved ? 'ok' : 'warn'}>
                          {l.approved ? 'Approved' : 'Pending approval'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-foot">
              <Button onClick={() => setSelectedDate(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
