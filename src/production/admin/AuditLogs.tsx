import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { dateTime } from '../api';
import { Empty } from '../ui';
import { useResource } from '../useResource';
import { PageHeading } from './shared';

type AuditEntry = {
  id: string;
  action: string;
  entityId: string | null;
  requestId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: { name: string; email: string; role: string } | null;
};
const pageSize = 50;

export function AuditLogsPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  const logs = useResource<{ items: AuditEntry[]; total: number }>(
    `/admin/audit-logs?limit=${pageSize}&offset=${offset}${search ? `&q=${encodeURIComponent(search)}` : ''}`,
  );
  return (
    <>
      <PageHeading title="EVERY ADMIN ACTION, ACCOUNTED FOR." />
      <div className="admin-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search audit logs"
            placeholder="Search action, person or entity ID"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
      </div>
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When (IST)</th>
                <th>Action</th>
                <th>Who</th>
                <th>Entity / request</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.data?.items.map((entry) => (
                <tr key={entry.id}>
                  <td>{dateTime(entry.createdAt)}</td>
                  <td>
                    <b>{entry.action}</b>
                  </td>
                  <td>
                    {entry.actor ? (
                      <>
                        {entry.actor.name}
                        <small>
                          {entry.actor.email} · {entry.actor.role}
                        </small>
                      </>
                    ) : (
                      'System'
                    )}
                  </td>
                  <td>
                    <code>{entry.entityId || '—'}</code>
                    <small>Request {entry.requestId}</small>
                  </td>
                  <td>
                    <code>
                      {Object.keys(entry.metadata || {}).length
                        ? JSON.stringify(entry.metadata)
                        : '—'}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.loading && <p className="muted">Loading…</p>}
        {logs.error && (
          <Empty title="Audit history could not be loaded" detail={logs.error.message} />
        )}
        {logs.data && !logs.data.items.length && (
          <Empty title="No audit actions match this search" />
        )}
      </div>
      {logs.data && logs.data.total > pageSize && (
        <div className="pagination-row">
          <button
            className="btn btn-outline"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            <ArrowLeft size={16} /> Newer
          </button>
          <span>
            {offset + 1}–{Math.min(offset + pageSize, logs.data.total)} of {logs.data.total}
          </span>
          <button
            className="btn btn-outline"
            disabled={offset + pageSize >= logs.data.total}
            onClick={() => setOffset(offset + pageSize)}
          >
            Older <ArrowRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}
