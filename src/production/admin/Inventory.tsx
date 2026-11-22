import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Barcode, Search, SlidersHorizontal } from 'lucide-react';
import { apiBase, dateTime, mutate, request, send } from '../api';
import { Badge, Empty, Modal, useUI } from '../ui';
import { useResource } from '../useResource';
import type { AdminProduct } from './Products';
import { newKey, PageHeading, useRole } from './shared';

type Movement = {
  id: string;
  sku: string;
  name: string;
  delta: number;
  before: number;
  after: number;
  reason: string;
  actor: string;
  at: string;
};
type Unit = { id: string; serialCode: string; state: string };
const pageSize = 50;
const reasons = ['Received', 'Damaged', 'Sold offline', 'Correction'];

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'stock' | 'log'>('stock');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [low, setLow] = useState(params.get('low') === '1');
  const [offset, setOffset] = useState(0);
  const [adjusting, setAdjusting] = useState<AdminProduct | null>(null);
  const [serials, setSerials] = useState<AdminProduct | null>(null);
  const deepLinkProduct = params.get('product');
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const filter = new URLSearchParams();
  if (search) filter.set('q', search);
  if (low) filter.set('lowStock', 'true');
  const products = useResource<{ items: AdminProduct[]; total: number }>(
    tab === 'stock' ? `/admin/products?${filter}&limit=${pageSize}&offset=${offset}` : null,
  );
  const movements = useResource<{ items: Movement[] }>(
    tab === 'log'
      ? `/admin/inventory/movements?${search ? `q=${encodeURIComponent(search)}` : ''}`
      : null,
  );
  // Deep link from the product editor opens the adjustment straight away.
  useEffect(() => {
    const id = deepLinkProduct;
    if (!id) return;
    void request<{ product: AdminProduct }>(`/admin/products/${id}`).then(
      (result) => setAdjusting(result.product),
      () => {},
    );
    const next = new URLSearchParams(params);
    next.delete('product');
    setParams(next, { replace: true });
  }, [deepLinkProduct, params, setParams]);

  const total = products.data?.total || 0;
  return (
    <>
      <PageHeading title="EVERY MODEL ACCOUNTED FOR." />
      <div className="collection-tabs" role="tablist" aria-label="Inventory views">
        <button
          role="tab"
          aria-selected={tab === 'stock'}
          className={tab === 'stock' ? 'active' : ''}
          onClick={() => setTab('stock')}
        >
          Stock by code {products.data && <span>{total}</span>}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'log'}
          className={tab === 'log' ? 'active' : ''}
          onClick={() => setTab('log')}
        >
          Movement log
        </button>
      </div>
      <div className="admin-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search inventory"
            placeholder={tab === 'stock' ? 'Search code or model' : 'Search code, model or reason'}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        {tab === 'stock' && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={low}
              onChange={(event) => {
                setLow(event.target.checked);
                setOffset(0);
              }}
            />
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
                  <th>Code</th>
                  <th>Model</th>
                  <th>Website stock</th>
                  <th>Alert threshold</th>
                  <th>Adjust</th>
                </tr>
              </thead>
              <tbody>
                {products.data?.items.map((product) => (
                  <StockRow
                    key={product.id}
                    product={product}
                    onAdjust={() => setAdjusting(product)}
                    onSerials={() => setSerials(product)}
                    onSaved={products.reload}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When (IST)</th>
                  <th>Code</th>
                  <th>Before → After</th>
                  <th>Reason</th>
                  <th>Who</th>
                </tr>
              </thead>
              <tbody>
                {movements.data?.items.map((movement) => (
                  <tr key={movement.id}>
                    <td>{dateTime(movement.at)}</td>
                    <td>
                      {movement.sku}
                      <small>{movement.name}</small>
                    </td>
                    <td>
                      <b>{movement.before}</b> →{' '}
                      <b className={movement.after < movement.before ? 'red' : 'saving'}>
                        {movement.after}
                      </b>
                    </td>
                    <td>{movement.reason}</td>
                    <td>{movement.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {(tab === 'stock' ? products : movements).loading && <p className="muted">Loading…</p>}
        {(tab === 'stock' ? products.error : movements.error) && (
          <Empty
            title="This list could not be loaded"
            detail={(tab === 'stock' ? products.error : movements.error)!.message}
          />
        )}
        {tab === 'stock' && products.data && !products.data.items.length && (
          <Empty title="Nothing matches this search" />
        )}
        {tab === 'log' && movements.data && !movements.data.items.length && (
          <Empty title="No stock movements yet" />
        )}
      </div>
      {tab === 'stock' && total > pageSize && (
        <div className="cr-pager">
          <button
            className="btn btn-small"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            <ArrowLeft size={15} /> Previous
          </button>
          <span>
            {offset + 1}–{Math.min(offset + pageSize, total)} of {total}
          </span>
          <button
            className="btn btn-small"
            disabled={offset + pageSize >= total}
            onClick={() => setOffset(offset + pageSize)}
          >
            Next <ArrowRight size={15} />
          </button>
        </div>
      )}
      {adjusting && (
        <AdjustDialog
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            products.reload();
            movements.reload();
          }}
        />
      )}
      {serials && <SerialsDialog product={serials} onClose={() => setSerials(null)} />}
    </>
  );
}

function StockRow({
  product,
  onAdjust,
  onSerials,
  onSaved,
}: {
  product: AdminProduct;
  onAdjust: () => void;
  onSerials: () => void;
  onSaved: () => void;
}) {
  const ui = useUI();
  const { csrfToken } = useRole();
  const low = product.available <= product.lowStockThreshold;
  return (
    <tr>
      <td>{product.sku}</td>
      <td>
        <b>{product.name}</b>
        <small>
          {product.brand} · {product.scale || '—'}
          {product.serialTracking ? ' · numbered units' : ''}
        </small>
      </td>
      <td>
        <span className={low ? 'badge status-failed' : 'badge status-success'}>
          {product.available}
          {product.available === 0 ? ' · Sold out' : low ? ' · Low' : ''}
        </span>
      </td>
      <td>
        <input
          className="threshold-input"
          aria-label={`Low stock threshold for ${product.sku}`}
          type="number"
          min="0"
          step="1"
          defaultValue={product.lowStockThreshold}
          onBlur={(event) => {
            const value = Number(event.target.value);
            if (value === product.lowStockThreshold) return;
            if (!Number.isInteger(value) || value < 0 || event.target.value === '') {
              event.target.value = String(product.lowStockThreshold);
              ui.toast('Threshold must be a whole number of zero or more.', true);
              return;
            }
            void ui
              .run(
                () =>
                  send(
                    'PATCH',
                    `/admin/products/${product.id}`,
                    { lowStockThreshold: value },
                    csrfToken,
                  ),
                `Alert for ${product.sku} set to ${value}.`,
              )
              .then((ok) =>
                ok ? onSaved() : (event.target.value = String(product.lowStockThreshold)),
              );
          }}
        />
      </td>
      <td>
        <div className="table-actions">
          <button
            className="btn btn-small"
            aria-label={`Adjust ${product.sku} stock`}
            onClick={onAdjust}
          >
            <SlidersHorizontal size={15} /> Adjust
          </button>
          {product.serialTracking && (
            <button className="btn btn-small" onClick={onSerials}>
              <Barcode size={15} /> Serials
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function AdjustDialog({
  product,
  onClose,
  onSaved,
}: {
  product: AdminProduct;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ui = useUI();
  const { csrfToken } = useRole();
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('Received');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per dialog so a double-click or retry never applies the change twice.
  const [key] = useState(newKey);
  const after = product.available + (Number.isFinite(delta) ? delta : 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
      ui.toast('Enter a change between −100 and 100, not zero.', true);
      return;
    }
    if (after < 0) {
      ui.toast('Stock cannot go below zero.', true);
      return;
    }
    setBusy(true);
    if (
      await ui.run(
        () =>
          mutate(
            `/admin/products/${product.id}/stock`,
            {
              delta,
              reason: `${reason}${note.trim() ? `: ${note.trim()}` : ''}`,
              idempotencyKey: key,
            },
            csrfToken,
          ),
        `Stock for ${product.sku} is now ${after}.`,
      )
    )
      onSaved();
    setBusy(false);
  }
  return (
    <Modal title={`Adjust ${product.sku}`} onClose={onClose}>
      <p>
        <b>{product.name}</b>
        <br />
        <span className="muted">Current stock: {product.available}</span>
      </p>
      <form onSubmit={submit}>
        <label>
          Quantity change
          <input
            type="number"
            step="1"
            min="-100"
            max="100"
            required
            value={Number.isFinite(delta) ? delta : ''}
            onChange={(event) => setDelta(event.target.valueAsNumber)}
          />
          <small>Use a negative number to remove stock, e.g. −2.</small>
        </label>
        <label>
          Reason
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {reasons.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Additional note
          <input maxLength={400} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {product.serialTracking && (
          <p className="muted">
            {delta > 0
              ? `${delta} new serial numbers will be created for labelling.`
              : 'Removed units are set aside (quarantined), not deleted.'}
          </p>
        )}
        <div className="stock-preview">
          After adjustment: <strong className={after < 0 ? 'red' : ''}>{after}</strong>
        </div>
        <button className="btn btn-primary full" disabled={busy}>
          Save adjustment <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}

function SerialsDialog({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void request<{ units: Unit[] }>(`/admin/products/${product.id}/units`).then(
      (result) => setUnits(result.units),
      (reason: Error) => setError(reason.message),
    );
  }, [product.id]);
  return (
    <Modal title={`Serials · ${product.name}`} onClose={onClose} className="wide-modal">
      <p className="muted">
        Each physical car has its own printable label. Showing up to 500 units.
      </p>
      {error && <p className="form-error">{error}</p>}
      {!units && !error && <p className="muted">Loading…</p>}
      {units && !units.length && (
        <Empty title="No numbered units yet" detail="Add stock to create them." />
      )}
      {units && units.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Serial</th>
                <th>State</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td>{unit.serialCode}</td>
                  <td>
                    <Badge
                      status={
                        unit.state === 'available'
                          ? 'live'
                          : unit.state === 'sold'
                            ? 'delivered'
                            : 'pending'
                      }
                      label={unit.state}
                    />
                  </td>
                  <td>
                    <a
                      className="text-link"
                      href={`${apiBase}/admin/units/${unit.id}/label.svg`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Print label
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
