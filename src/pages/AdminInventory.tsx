import { useState } from 'react';
import { Search, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { adjustStock } from '../services/inventory';
import { transact } from '../services/storage';
import { dateTime } from '../services/format';
import AdminLayout from '../components/AdminLayout';
import { Modal, useUI, Empty } from '../components/UI';
import type { Product } from '../types';
export default function AdminInventory() {
  const state = useStore(),
    ui = useUI(),
    [q, setQ] = useState(''),
    [low, setLow] = useState(false),
    [edit, setEdit] = useState<Product | null>(null),
    [delta, setDelta] = useState(1),
    [reason, setReason] = useState('Received'),
    [note, setNote] = useState(''),
    [tab, setTab] = useState('stock');
  const products = state.products.filter(
    (p) =>
      (!low || p.stock <= p.threshold) &&
      `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase()),
  );
  const movements = state.movements.filter(
    (m) => !q || `${m.sku} ${m.reason}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <AdminLayout title="EVERY MODEL ACCOUNTED FOR.">
      <div className="collection-tabs">
        <button className={tab === 'stock' ? 'active' : ''} onClick={() => setTab('stock')}>
          Stock by SKU <span>{state.products.length}</span>
        </button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
          Movement log <span>{state.movements.length}</span>
        </button>
      </div>
      <div className="admin-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search inventory"
            placeholder="Search SKU, model or movement reason"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {tab === 'stock' && (
          <label className="check-row">
            <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} />
            Low stock only
          </label>
        )}
      </div>
      <div className="panel table-panel">
        <div className="table-wrap">
          {tab === 'stock' ? (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Model</th>
                  <th>Website stock</th>
                  <th>Tally stock</th>
                  <th>Alert threshold</th>
                  <th>Adjust</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.sku}</td>
                    <td>
                      <b>{p.name}</b>
                      <small>
                        {p.brand} · {p.scale}
                      </small>
                    </td>
                    <td>
                      <span
                        className={
                          p.stock <= p.threshold ? 'badge status-failed' : 'badge status-success'
                        }
                      >
                        {p.stock}
                        {p.stock === 0 ? ' · Sold out' : p.stock <= p.threshold ? ' · Low' : ''}
                      </span>
                    </td>
                    <td>{state.tally.stock[p.id] ?? '—'}</td>
                    <td>
                      <input
                        className="threshold-input"
                        aria-label={`Low stock threshold for ${p.sku}`}
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={p.threshold}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isInteger(n) || n < 0 || e.target.value === '') {
                            e.target.value = String(p.threshold);
                            ui.toast('Threshold must be a whole number of zero or more.', true);
                            return;
                          }
                          transact((d) => {
                            const product = d.products.find((x) => x.id === p.id);
                            if (product) product.threshold = n;
                          });
                        }}
                      />
                    </td>
                    <td>
                      <button
                        className="btn btn-small"
                        aria-label={`Adjust ${p.sku} stock`}
                        onClick={() => {
                          setEdit(p);
                          setDelta(1);
                          setNote('');
                        }}
                      >
                        <SlidersHorizontal size={15} /> Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When (IST)</th>
                  <th>SKU</th>
                  <th>Before → After</th>
                  <th>Reason</th>
                  <th>Who</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{dateTime(m.at)}</td>
                    <td>{m.sku}</td>
                    <td>
                      <b>{m.before}</b> →{' '}
                      <b className={m.after < m.before ? 'red' : 'saving'}>{m.after}</b>
                    </td>
                    <td>{m.reason}</td>
                    <td>{m.who}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {(tab === 'stock' ? !products.length : !movements.length) && (
          <Empty title="Nothing matches this search" />
        )}
      </div>
      {edit && (
        <Modal title={`Adjust ${edit.sku}`} onClose={() => setEdit(null)}>
          <p>
            <b>{edit.name}</b>
            <br />
            <span className="muted">
              Current stock: {state.products.find((p) => p.id === edit.id)?.stock}
            </span>
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                ui.run(
                  () => adjustStock(edit.id, delta, `${reason}${note ? ': ' + note : ''}`),
                  'Inventory adjusted. A Tally sync job has been queued.',
                )
              )
                setEdit(null);
            }}
          >
            <label>
              Quantity change
              <input
                aria-label="Quantity change"
                type="number"
                step="1"
                required
                value={delta}
                onChange={(e) => setDelta(Number(e.target.value))}
              />
              <small>Use a negative number to remove stock, e.g. −2.</small>
            </label>
            <label>
              Reason
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {['Received', 'Damaged', 'Sold offline', 'Correction'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Additional note
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="stock-preview">
              After adjustment:{' '}
              <strong>{(state.products.find((p) => p.id === edit.id)?.stock ?? 0) + delta}</strong>
            </div>
            <button className="btn btn-primary full">
              Save adjustment <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}
