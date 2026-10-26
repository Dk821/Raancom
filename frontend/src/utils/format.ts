let companyTz = 'Asia/Kolkata';
export const setCompanyTimezone = (tz: string) => {
  companyTz = tz || companyTz;
};
export const getCompanyTimezone = () => companyTz;

/** YYYY-MM-DD for "today" in the company's timezone. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: companyTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export function fmtWeekday(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: companyTz });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: companyTz })} ${fmtTime(iso)}`;
}

export function fmtMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function fmtDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export const monthOf = (iso: string) => iso.slice(0, 7);

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "2026-10-26" + "09:30" in the company timezone -> ISO instant with the correct offset. */
export function zonedToIso(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: companyTz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

export const titleCase = (s: string) =>
  s.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner', HR: 'HR', REPORTING_MANAGER: 'Reporting Manager', EMPLOYEE: 'Employee',
};
export const MODE_LABEL: Record<string, string> = { OFFICE: 'Office', OUTSIDE_WORK: 'Outside work', WFH: 'Work from home' };
