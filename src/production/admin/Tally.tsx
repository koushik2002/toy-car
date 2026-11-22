import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plug, RefreshCw } from 'lucide-react';
import { dateTime, mutate } from '../api';
import { Badge, Empty, ErrorPanel, useUI } from '../ui';
import { useResource } from '../useResource';
import { PageHeading, useRole } from './shared';

type TallyJob = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};
const states = ['pending', 'processing', 'sent', 'failed'] as const;
const stateWords: Record<string, string> = {
  pending: 'Waiting',
  processing: 'Sending',
  sent: 'In Tally',
  failed: 'Failed',
};

export function TallyPage() {
  const ui = useUI();
  const { csrfToken } = useRole();
  const jobs = useResource<{ items: TallyJob[] }>('/admin/tally-jobs');
  const [filter, setFilter] = useState('');
  const items = jobs.data?.items || [];
  const shown = items.filter((job) => !filter || job.status === filter);
  async function retry(job: TallyJob) {
    if (
      await ui.run(
        () => mutate(`/admin/tally-jobs/${job.id}/retry`, {}, csrfToken),
        `${job.invoice_number} will be sent again.`,
      )
    )
      jobs.reload();
  }
  return (
    <>
      <PageHeading title="THE TALLY CONNECTION." />
      <div className="panel tally-connection">
        <div>
          <span className="connection-indicator off">
            <Plug size={25} />
          </span>
          <div>
            <h2>TALLYPRIME / NOT CONNECTED YET</h2>
            <p>
              Every issued bill is queued here and kept safely until the Tally connector on the
              shop’s Windows PC collects it. Nothing is lost while Tally is offline.
            </p>
          </div>
        </div>
        <div className="cr-needs">
          <b>Needed from the client to connect</b>
          <ul>
            <li>TallyPrime version and the company name used in Tally</li>
            <li>Sales voucher type and the sales, customer and tax ledgers</li>
            <li>How each product code maps to a Tally stock item</li>
            <li>Which Windows PC runs Tally, and who looks after it</li>
            <li>Whether Tally or the website is the master for stock</li>
          </ul>
        </div>
      </div>
      <div className="sync-kpis">
        {states.map((state) => (
          <button
            key={state}
            className={filter === state ? 'active' : ''}
            aria-pressed={filter === state}
            onClick={() => setFilter(filter === state ? '' : state)}
          >
            <Badge
              status={state === 'sent' ? 'sent' : state === 'failed' ? 'failed' : 'pending'}
              label={stateWords[state]}
            />
            <strong>{items.filter((job) => job.status === state).length}</strong>
            <span>bills</span>
          </button>
        ))}
      </div>
      <div className="panel table-panel">
        {jobs.error ? (
          <ErrorPanel error={jobs.error} retry={jobs.reload} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Queued (IST)</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Last problem</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link to={`/admin/billing/invoices/${job.invoice_id}`}>
                        {job.invoice_number}
                      </Link>
                    </td>
                    <td>{dateTime(job.created_at)}</td>
                    <td>
                      <Badge
                        status={
                          job.status === 'sent'
                            ? 'sent'
                            : job.status === 'failed'
                              ? 'failed'
                              : 'pending'
                        }
                        label={stateWords[job.status]}
                      />
                    </td>
                    <td>{job.attempts}</td>
                    <td>{job.last_error || '—'}</td>
                    <td>
                      {job.status === 'failed' && (
                        <button className="btn btn-small" onClick={() => void retry(job)}>
                          <RefreshCw size={14} /> Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {jobs.data && !shown.length && (
          <Empty title={filter ? 'No bills in this state' : 'No bills queued yet'} />
        )}
      </div>
    </>
  );
}
