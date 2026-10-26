import { useState } from 'react';
import { api } from '../../api/client';
import { LeaveType, ReportData } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Button, Card, Empty, ErrorNote, Field, PageHead, Spinner, useToast } from '../../components/ui';
import { errMsg, useAsync } from '../../hooks/useAsync';
import { monthRange, todayIso } from '../../utils/format';

const REPORTS: { id: string; label: string; help: string; needs: ('range' | 'mode' | 'status' | 'leaveType' | 'year')[] }[] = [
  { id: 'attendance', label: 'Daily attendance', help: 'One row per employee per day.', needs: ['range', 'mode', 'status'] },
  { id: 'attendance-summary', label: 'Attendance summary', help: 'Totals per employee for the period.', needs: ['range'] },
  { id: 'exceptions', label: 'Exceptions', help: 'Absent, incomplete, late, flagged and corrected days.', needs: ['range'] },
  { id: 'leave', label: 'Leave requests', help: 'Applications and their outcome.', needs: ['range', 'leaveType'] },
  { id: 'leave-balances', label: 'Leave balances', help: 'Current balance per employee and type.', needs: ['year'] },
  { id: 'leave-ledger', label: 'Leave ledger', help: 'Every credit and debit, in order.', needs: ['range', 'leaveType'] },
];
const STATUSES = ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'INCOMPLETE', 'NOT_MARKED', 'HOLIDAY', 'WEEKLY_OFF'];

export default function ReportsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { from, to } = monthRange(todayIso().slice(0, 7));
  const [report, setReport] = useState('attendance');
  const [f, setF] = useState({ from, to, department: '', employee_id: '', mode: '', status: '', leave_type_id: '', year: String(new Date().getFullYear()) });
  const [applied, setApplied] = useState<null | { report: string; q: Record<string, string> }>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const def = REPORTS.find((r) => r.id === report)!;
  const types = useAsync(() => api.get<LeaveType[]>('/leave/types'), []);
  const depts = useAsync(() => api.get<string[]>('/employees/departments').catch(() => [] as string[]), []);

  const query = (): Record<string, string> => {
    const q: Record<string, string> = {};
    if (def.needs.includes('range')) { q.from = f.from; q.to = f.to; }
    if (def.needs.includes('year')) q.year = f.year;
    if (def.needs.includes('mode') && f.mode) q.mode = f.mode;
    if (def.needs.includes('status') && f.status) q.status = f.status;
    if (def.needs.includes('leaveType') && f.leave_type_id) q.leave_type_id = f.leave_type_id;
    if (f.department) q.department = f.department;
    return q;
  };

  const data = useAsync<ReportData | null>(
    () => (applied ? api.get<ReportData>(`/reports/${applied.report}`, applied.q) : Promise.resolve(null)),
    [applied],
  );

  const run = () => {
    if (def.needs.includes('range') && (!f.from || !f.to || f.from > f.to)) {
      toast.show('Choose a valid date range', 'error');
      return;
    }
    setApplied({ report, q: query() });
  };
  const exportAs = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    try {
      await api.download('/reports/export', { report, format, ...query() }, `${report}.${format}`);
    } catch (e) {
      toast.show(errMsg(e), 'error');
    } finally {
      setExporting(null);
    }
  };

  const scope = user!.role === 'REPORTING_MANAGER' ? 'your team' : 'the company';
  return (
    <>
      <PageHead title="Reports" subtitle={`Showing data for ${scope}. Exports are recorded in the audit log.`} />
      <Card>
        <div className="stack">
          <div className="filters" style={{ marginBottom: 0 }}>
            <Field label="Report">
              {(id) => <select id={id} value={report} onChange={(e) => { setReport(e.target.value); setApplied(null); }}>
                {REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>}
            </Field>
            {def.needs.includes('range') && (
              <>
                <Field label="From">{(id) => <input id={id} type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />}</Field>
                <Field label="To">{(id) => <input id={id} type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />}</Field>
              </>
            )}
            {def.needs.includes('year') && (
              <Field label="Year">{(id) => <input id={id} type="number" min={2000} max={2100} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} />}</Field>
            )}
            <Field label="Department">
              {(id) => <select id={id} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
                <option value="">All</option>{depts.data?.map((d) => <option key={d}>{d}</option>)}</select>}
            </Field>
            {def.needs.includes('mode') && (
              <Field label="Mode">
                {(id) => <select id={id} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                  <option value="">All</option><option value="OFFICE">Office</option><option value="OUTSIDE_WORK">Outside work</option><option value="WFH">Work from home</option></select>}
              </Field>
            )}
            {def.needs.includes('status') && (
              <Field label="Status">
                {(id) => <select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                  <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}</select>}
              </Field>
            )}
            {def.needs.includes('leaveType') && (
              <Field label="Leave type">
                {(id) => <select id={id} value={f.leave_type_id} onChange={(e) => setF({ ...f, leave_type_id: e.target.value })}>
                  <option value="">All</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}</select>}
              </Field>
            )}
          </div>
          <p className="muted small">{def.help}</p>
          <div className="row">
            <Button variant="primary" onClick={run}>Run report</Button>
            <Button loading={exporting === 'csv'} onClick={() => exportAs('csv')}>Export CSV</Button>
            <Button loading={exporting === 'xlsx'} onClick={() => exportAs('xlsx')}>Export Excel</Button>
          </div>
        </div>
      </Card>

      <div className="mt-s" />
      {data.loading && applied && <Spinner />}
      {data.error && <ErrorNote message={data.error} onRetry={data.reload} />}
      {data.data && (
        <Card flush title={<span style={{ padding: '0 18px' }}>{data.data.name} · {data.data.rows.length} row(s)</span>}>
          {data.data.rows.length >= 5000 && <Alert tone="warn">Large result: narrow the filters, or export for the full set.</Alert>}
          {data.data.rows.length === 0 ? <Empty>No data for these filters.</Empty> : (
            <div className="table-wrap" style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <table>
                <thead><tr>{data.data.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {data.data.rows.slice(0, 1000).map((r, i) => (
                    <tr key={i}>{data.data!.columns.map((c) => <td key={c.key} className="nowrap">{r[c.key] ?? ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.data.rows.length > 1000 && <p className="muted small" style={{ padding: '8px 18px' }}>Showing the first 1,000 rows. Export to get all of them.</p>}
        </Card>
      )}
      {!applied && <Empty>Choose a report and select “Run report”.</Empty>}
    </>
  );
}
