import { IconCalendarDays } from './icons';
import { Badge, Card, Empty } from './ui';
import { fmtDate, todayIso } from '../utils/format';

export interface UpcomingHolidayItem {
  id?: number;
  date: string;
  name: string;
  holiday_type?: string;
}

export function getDaysAway(dateStr: string): { label: string; tone: 'ok' | 'warn' | 'info' | '' } {
  const today = todayIso();
  if (dateStr === today) return { label: 'Today', tone: 'ok' };
  const [y1, m1, d1] = dateStr.slice(0, 10).split('-').map(Number);
  const [y0, m0, d0] = today.slice(0, 10).split('-').map(Number);
  const dt1 = Date.UTC(y1, m1 - 1, d1);
  const dt0 = Date.UTC(y0, m0 - 1, d0);
  const diff = Math.round((dt1 - dt0) / (1000 * 60 * 60 * 24));
  if (diff === 1) return { label: 'Tomorrow', tone: 'warn' };
  if (diff > 1) return { label: `In ${diff} days`, tone: 'info' };
  if (diff < 0) return { label: `${Math.abs(diff)}d ago`, tone: '' };
  return { label: 'Today', tone: 'ok' };
}

export function getWeekdayName(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

export default function UpcomingHolidaysTable({
  holidays,
  title = 'Upcoming holidays',
}: {
  holidays: UpcomingHolidayItem[];
  title?: string;
}) {
  if (!holidays || holidays.length === 0) return null;

  return (
    <Card
      flush
      title={
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <IconCalendarDays style={{ color: 'var(--primary)' }} />
          <span>{title}</span>
        </div>
      }
      actions={
        <span className="small muted" style={{ paddingRight: 18 }}>
          {holidays.length} upcoming
        </span>
      }
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Holiday</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>When</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((h) => {
              const away = getDaysAway(h.date);
              const weekday = getWeekdayName(h.date);
              return (
                <tr key={h.id ?? h.date}>
                  <td className="nowrap" style={{ fontWeight: 600 }}>
                    {fmtDate(h.date)}
                  </td>
                  <td className="nowrap muted">{weekday}</td>
                  <td style={{ fontWeight: 500 }}>{h.name}</td>
                  <td>
                    <Badge tone={h.holiday_type?.toUpperCase() === 'OPTIONAL' ? 'warn' : 'brand'}>
                      {(h.holiday_type || 'PUBLIC').toLowerCase()}
                    </Badge>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Badge tone={away.tone}>{away.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
