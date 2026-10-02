import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Download, Check, ArrowRight, Plug, AlertCircle } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { transact } from '../services/storage';
import { retryJob, retryAll, pullStock, setOffline } from '../services/tallySync';
import { reconcile } from '../services/inventory';
import { dateTime } from '../services/format';
import AdminLayout from '../components/AdminLayout';
import { Badge, useUI, Empty } from '../components/UI';
export default function AdminTally() {
  const state = useStore(),
    ui = useUI(),
    [tab, setTab] = useState('log'),
    [status, setStatus] = useState(''),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const mismatches = state.products.filter(
    (p) => state.tally.stock[p.id] !== undefined && p.stock !== state.tally.stock[p.id],
  );
  const jobs = state.jobs.filter((j) => !status || j.status === status);
  return (
    <AdminLayout title="THE TALLY CONNECTION.">
      <div className="tally-disclaimer">
        <Plug size={19} />
        <span>
          <strong>Simulated — production uses a TallyPrime connector/bridge.</strong>
          <br />
          No accounting software is contacted. All jobs and stock snapshots live in your browser.
        </span>
        <Link className="text-link" to="/features">
          Explore demo <ArrowRight size={15} />
        </Link>
      </div>
      <div className="panel tally-connection" data-tour="tally">
        <div>
          <span className={`connection-indicator ${state.tally.offline ? 'off' : ''}`}>
            <Plug size={25} />
          </span>
          <div>
            <h2>TALLYPRIME / {state.tally.offline ? 'DISCONNECTED' : 'CONNECTED'}</h2>
            <p>{state.tally.company}</p>
            <small className="muted">
              Last sync:{' '}
              {state.tally.lastSync ? dateTime(state.tally.lastSync) + ' IST' : 'Not synced yet'}
            </small>
          </div>
        </div>
        <div className="tally-controls">
          <label className="toggle-row">
            <span>Simulate Tally offline</span>
            <input
              type="checkbox"
              role="switch"
              checked={state.tally.offline}
              onChange={(e) => setOffline(e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <span>Automatic retry</span>
            <input
              type="checkbox"
              role="switch"
              checked={state.tally.autoRetry}
              onChange={(e) =>
                transact((d) => {
                  d.tally.autoRetry = e.target.checked;
                })
              }
            />
          </label>
          <label className="failure-slider">
            Failure rate: <b>{state.tally.failureRate}%</b>
            <input
              type="range"
              aria-label="Sync failure rate"
              min="0"
              max="100"
              step="5"
              value={state.tally.failureRate}
              onChange={(e) =>
                transact((d) => {
                  d.tally.failureRate = Number(e.target.value);
                })
              }
            />
          </label>
        </div>
      </div>
      <div className="sync-kpis">
        {['pending', 'success', 'failed'].map((s) => (
          <div key={s}>
            <Badge status={s} />
            <strong>{state.jobs.filter((j) => j.status === s).length}</strong>
            <span>sync jobs</span>
          </div>
        ))}
        <button
          className="btn btn-small"
          onClick={() =>
            ui.run(
              pullStock,
              state.tally.offline
                ? 'Stock pull queued; simulated bridge is offline.'
                : 'Stock snapshot requested. Check reconciliation.',
            )
          }
        >
          <Download size={16} /> Pull stock from Tally
        </button>
      </div>
      <div className="collection-tabs">
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
          Sync log <span>{state.jobs.length}</span>
        </button>
        <button
          className={tab === 'reconciliation' ? 'active' : ''}
          onClick={() => setTab('reconciliation')}
        >
          Reconciliation <span>{mismatches.length}</span>
        </button>
        <button className={tab === 'mapping' ? 'active' : ''} onClick={() => setTab('mapping')}>
          SKU mapping
        </button>
      </div>
      {tab === 'log' ? (
        <>
          <div className="admin-toolbar">
            <select
              aria-label="Filter sync status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All sync states</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
            <button
              className="btn btn-small"
              onClick={() => ui.run(retryAll, 'Failed jobs queued for retry.')}
              disabled={!state.jobs.some((j) => j.status === 'failed')}
            >
              <RefreshCw size={16} /> Retry all failed
            </button>
            <small className="muted">Auto retry: exponential backoff, up to 5 attempts.</small>
          </div>
          <div className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job type</th>
                    <th>Reference</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Time (IST)</th>
                    <th>Error / backoff</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.type}</td>
                      <td>{j.reference}</td>
                      <td>
                        <Badge status={j.status} />
                      </td>
                      <td>{j.attempts}</td>
                      <td>{dateTime(j.at)}</td>
                      <td>
                        {j.error && <span className="red">{j.error}</span>}
                        {j.status === 'failed' && state.tally.autoRetry && j.attempts < 5 && (
                          <small>
                            Auto retry in {Math.max(0, Math.ceil((j.nextAt - now) / 1000))}s
                          </small>
                        )}
                        {j.status === 'failed' && j.attempts >= 5 && (
                          <small>Automatic retries exhausted. Retry manually.</small>
                        )}
                        {j.status === 'pending' && (
                          <small className="pending-pulse">
                            Processing in {Math.max(0, Math.ceil((j.nextAt - now) / 1000))}s…
                          </small>
                        )}
                      </td>
                      <td>
                        {j.status === 'failed' && (
                          <button
                            className="btn btn-small"
                            aria-label={`Retry ${j.reference}`}
                            onClick={() =>
                              ui.run(() => retryJob(j.id), 'Sync job queued for retry.')
                            }
                          >
                            <RefreshCw size={14} /> Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!jobs.length && <Empty title="No jobs in this state" />}
          </div>
        </>
      ) : tab === 'reconciliation' ? (
        <>
          <div className="notice">
            <AlertCircle size={18} />
            <span>
              Compare the local website stock with the simulated Tally snapshot. Accepting either
              source writes an inventory movement and queues a stock sync.
            </span>
          </div>
          <div className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU / Model</th>
                    <th>Website</th>
                    <th>Tally</th>
                    <th>Difference</th>
                    <th>Resolve</th>
                  </tr>
                </thead>
                <tbody>
                  {mismatches.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.sku}</b>
                        <small>{p.name}</small>
                      </td>
                      <td>{p.stock}</td>
                      <td>{state.tally.stock[p.id]}</td>
                      <td className="low">
                        {state.tally.stock[p.id] - p.stock > 0 ? '+' : ''}
                        {state.tally.stock[p.id] - p.stock}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="btn btn-small"
                            onClick={() =>
                              ui.run(
                                () => reconcile(p.id, 'website'),
                                'Website stock accepted; inventory log updated.',
                              )
                            }
                          >
                            Accept website
                          </button>
                          <button
                            className="btn btn-small"
                            onClick={() =>
                              ui.run(
                                () => reconcile(p.id, 'tally'),
                                'Tally stock accepted; inventory log updated.',
                              )
                            }
                          >
                            Accept Tally
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!mismatches.length && (
              <Empty title="All aligned" detail="Website and Tally snapshots agree.">
                <Check className="saving" size={30} />
              </Empty>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Edit a Tally item name below. Each website SKU maps to a simulated accounting item.
          </p>
          <div className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Website SKU</th>
                    <th>Model</th>
                    <th>Tally item name</th>
                  </tr>
                </thead>
                <tbody>
                  {state.products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.sku}</td>
                      <td>{p.name}</td>
                      <td>
                        <input
                          aria-label={`Tally mapping for ${p.sku}`}
                          value={state.tally.mapping[p.id] ?? ''}
                          onChange={(e) =>
                            transact((d) => {
                              d.tally.mapping[p.id] = e.target.value;
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
