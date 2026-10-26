import { useState } from 'react';
import { api } from '../../api/client';
import { Page } from '../../api/types';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHead, Pager, Spinner } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { fmtDateTime, titleCase } from '../../utils/format';

interface Entry {
  id: number; created_at: string; actor: string | null; actor_role: string | null; action: string;
  entity_type: string | null; entity_id: number | null; details: Record<string, unknown> | null; ip: string | null;
}

export default function AuditPage() {
  const [f, setF] = useState({ action: '', entity_type: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<Entry | null>(null);
  const res = useAsync(() => api.get<Page<Entry>>('/audit-logs', { ...applied, limit: 50, offset }), [applied, offset]);

  return (
    <>
      <PageHead title="Audit log" subtitle="A permanent record of sensitive actions. Entries cannot be edited or deleted." />
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setApplied(f); setOffset(0); }}>
        <Field label="Action starts with">{(id) => <input id={id} type="text" placeholder="e.g. LEAVE" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} />}</Field>
        <Field label="Record type">{(id) => <input id={id} type="text" placeholder="e.g. employee" value={f.entity_type} onChange={(e) => setF({ ...f, entity_type: e.target.value })} />}</Field>
        <Field label="From">{(id) => <input id={id} type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />}</Field>
        <Field label="To">{(id) => <input id={id} type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />}</Field>
        <Button variant="primary" type="submit">Apply</Button>
      </form>
      {res.loading && !res.data && <Spinner />}
      {res.error && <ErrorNote message={res.error} onRetry={res.reload} />}
      {res.data && (
        <Card flush>
          {res.data.items.length === 0 ? <Empty>No entries match.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>IP</th></tr></thead>
                <tbody>
                  {res.data.items.map((a) => (
                    <tr key={a.id} className="click" tabIndex={0} onClick={() => setOpen(a)} onKeyDown={(e) => e.key === 'Enter' && setOpen(a)}>
                      <td className="nowrap">{fmtDateTime(a.created_at)}</td>
                      <td>{a.actor ?? 'System'}<div className="small muted">{a.actor_role ? titleCase(a.actor_role) : ''}</div></td>
                      <td><Badge>{titleCase(a.action)}</Badge></td>
                      <td>{a.entity_type ?? '—'}{a.entity_id ? ` #${a.entity_id}` : ''}</td>
                      <td className="small muted">{a.ip ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager total={res.data.total} limit={res.data.limit} offset={offset} onChange={setOffset} />
        </Card>
      )}
      {open && (
        <Modal title={titleCase(open.action)} onClose={() => setOpen(null)} wide>
          <div className="stack">
            <div className="muted small">{fmtDateTime(open.created_at)} · {open.actor ?? 'System'} · {open.ip ?? 'no IP'}</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-2)', padding: 12, borderRadius: 8, fontSize: '0.85rem' }}>
              {open.details ? JSON.stringify(open.details, null, 2) : 'No further details.'}
            </pre>
          </div>
        </Modal>
      )}
    </>
  );
}
