import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Barcode,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import { apiBase, money, mutate, request, send, type CatalogueProduct } from '../api';
import { Badge, Empty, Modal, Photo, useUI } from '../ui';
import { useResource } from '../useResource';
import { PageHeading, rupeesToPaise, useRole } from './shared';

export type AdminProduct = CatalogueProduct & { published: boolean; serialTracking: boolean };
type ProductList = { items: AdminProduct[]; total: number; brands: string[] };
type ImportPreview = {
  jobId: string;
  rowCount: number;
  errorCount: number;
  preview: {
    rowNumber: number;
    action: 'create' | 'update' | 'invalid';
    name: string;
    sku: string;
    brand: string;
    series: string;
    pricePaise: number;
    stock: number;
    errors: string[];
  }[];
};

export const scales = ['1:64', '1:43', '1:32', '1:24', '1:18'];
export const conditions = ['New', 'Pre-owned', 'Card damaged'];
// Agreed photo order from the client checklist; names still need the client's confirmation.
export const viewNames = [
  'Front three-quarter',
  'Rear three-quarter',
  'Left side',
  'Right side / detail',
  'Top / interior',
];
const pageSize = 25;
const templateColumns = [
  'name',
  'brand',
  'series',
  'manufacture_year',
  'scale',
  'condition',
  'price',
  'mrp',
  'stock',
  'low_stock_threshold',
  'rare',
  'offer',
  'serial_tracking',
  'variant_group',
  'variant_label',
  'description',
  'sku',
];

function downloadTemplate() {
  const example = [
    'Nissan Skyline GT-R (R34)',
    'Hot Wheels',
    'Mainline',
    '2024',
    '1:64',
    'New',
    '249',
    '349',
    '8',
    '3',
    'no',
    'Starter Garage',
    'no',
    'hot-wheels-r34',
    'Blue / Mainline',
    'Detailed diecast body with real rider tyres.',
    '',
  ];
  const csv = `${templateColumns.join(',')}\r\n${example.map((v) => `"${v}"`).join(',')}\r\n`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv' }));
  link.download = 'tiny-kars-product-template.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ProductsPage() {
  const ui = useUI();
  const { csrfToken } = useRole();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [status, setStatus] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const filters = new URLSearchParams();
  if (search) filters.set('q', search);
  if (brand) filters.set('brand', brand);
  if (status) filters.set('status', status);
  if (lowStock) filters.set('lowStock', 'true');
  const list = useResource<ProductList>(
    `/admin/products?${filters}&limit=${pageSize}&offset=${offset}`,
  );
  const items = list.data?.items || [];
  const total = list.data?.total || 0;

  async function quickToggle(product: AdminProduct) {
    if (
      await ui.run(
        () =>
          mutate(
            `/admin/products/${product.id}/${product.published ? 'archive' : 'publish'}`,
            {},
            csrfToken,
          ),
        product.published ? `${product.name} is hidden from shoppers.` : `${product.name} is live.`,
      )
    )
      list.reload();
  }

  return (
    <>
      <PageHeading title="THE COLLECTIBLES." />
      <div className="admin-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search products"
            placeholder="Search name, code or brand"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <select
          aria-label="Filter product brand"
          value={brand}
          onChange={(event) => {
            setBrand(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">All brands</option>
          {list.data?.brands.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <select
          aria-label="Filter product status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">Live and drafts</option>
          <option value="live">Live only</option>
          <option value="draft">Drafts only</option>
        </select>
        <label className="check-row">
          <input
            type="checkbox"
            checked={lowStock}
            onChange={(event) => {
              setLowStock(event.target.checked);
              setOffset(0);
            }}
          />
          Low stock only
        </label>
      </div>
      <div className="admin-toolbar cr-actions">
        <a className="btn btn-small" href={`${apiBase}/admin/products/export.csv?${filters}`}>
          <Download size={15} /> Export CSV
        </a>
        <button className="btn btn-small" onClick={downloadTemplate}>
          <FileSpreadsheet size={15} /> Download template
        </button>
        <button className="btn btn-small" onClick={() => setImporting(true)}>
          <Upload size={15} /> Import CSV
        </button>
        <Link className="btn btn-small" to="/admin/labels">
          <Barcode size={15} /> Print labels
        </Link>
        <button className="btn btn-primary btn-small" onClick={() => setEditing('new')}>
          <Plus size={16} /> Add model
        </button>
      </div>
      <p className="muted" role="status">
        {list.loading
          ? 'Loading models…'
          : `${total} models · A model goes live once all five photos are added and it is published.`}
      </p>
      <div className="panel table-panel">
        {list.error ? (
          <Empty title="Products could not be loaded" detail={list.error.message}>
            <button className="btn" onClick={list.reload}>
              Try again
            </button>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Collectible</th>
                  <th>Code</th>
                  <th>Brand / series</th>
                  <th>Scale</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => {
                  const low = product.available <= product.lowStockThreshold;
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="table-product">
                          <Photo url={product.images[0]?.url} alt="" />
                          <span>
                            <b>{product.name}</b>
                            <small>
                              {product.condition}
                              {product.rare ? ' · ✦ Rare' : ''} · {product.images.length}/5 photos
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>{product.sku}</td>
                      <td>
                        {product.brand}
                        <small>{product.series}</small>
                      </td>
                      <td>{product.scale || '—'}</td>
                      <td>{money(product.pricePaise)}</td>
                      <td>
                        <span className={low ? 'low' : ''}>
                          {product.available}
                          {product.available === 0 ? ' · Sold out' : low ? ' · Low' : ''}
                        </span>
                      </td>
                      <td>
                        <Badge
                          status={product.published ? 'live' : 'draft'}
                          label={
                            product.requiresReview
                              ? 'Needs name review'
                              : product.published
                                ? 'Live'
                                : 'Draft'
                          }
                        />
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="icon-btn"
                            aria-label={`Edit ${product.name}`}
                            onClick={() => setEditing(product)}
                          >
                            <Pencil size={16} />
                          </button>
                          <a
                            className="icon-btn"
                            aria-label={`Print barcode for ${product.name}`}
                            href={`${apiBase}/admin/products/${product.id}/label.svg`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Barcode size={16} />
                          </a>
                          <button
                            className="btn btn-small"
                            disabled={
                              !product.published &&
                              (product.images.length < 5 || product.requiresReview)
                            }
                            title={
                              !product.published && product.requiresReview
                                ? 'Replace the temporary import identifier first'
                                : !product.published && product.images.length < 5
                                  ? 'Add all five photos first'
                                  : undefined
                            }
                            onClick={() => void quickToggle(product)}
                          >
                            {product.published ? 'Archive' : 'Publish'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!list.loading && !list.error && !items.length && (
          <Empty title="No models match your search" detail="Clear a filter or add a model." />
        )}
      </div>
      {total > pageSize && (
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
      {editing && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          brands={list.data?.brands || []}
          onClose={() => setEditing(null)}
          onSaved={list.reload}
        />
      )}
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            list.reload();
          }}
        />
      )}
    </>
  );
}

type Draft = {
  name: string;
  brand: string;
  series: string;
  manufactureYear: string;
  scale: string;
  condition: string;
  price: string;
  mrp: string;
  lowStockThreshold: string;
  rare: boolean;
  offer: string;
  variantGroup: string;
  variantLabel: string;
  serialTracking: boolean;
  description: string;
};

function draftOf(product: AdminProduct | null): Draft {
  return {
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    series: product?.series ?? '',
    manufactureYear: product?.manufactureYear ? String(product.manufactureYear) : '',
    scale: product?.scale || '1:64',
    condition: product?.condition || 'New',
    price: product ? String(product.pricePaise / 100) : '',
    mrp: product ? String(product.mrpPaise / 100) : '',
    lowStockThreshold: String(product?.lowStockThreshold ?? 3),
    rare: product?.rare ?? false,
    offer: product?.offer ?? '',
    variantGroup: product?.variantGroup ?? '',
    variantLabel: product?.variantLabel ?? '',
    serialTracking: product?.serialTracking ?? false,
    description: product?.description ?? '',
  };
}

function ProductEditor({
  product: initial,
  brands,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  brands: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ui = useUI();
  const { csrfToken } = useRole();
  const [product, setProduct] = useState(initial);
  const [draft, setDraft] = useState<Draft>(draftOf(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function reloadProduct(id: string) {
    const result = await request<{ product: AdminProduct }>(`/admin/products/${id}`);
    setProduct(result.product);
    setDraft(draftOf(result.product));
    onSaved();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    const fields: Record<string, unknown> = {
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      series: draft.series.trim(),
      manufactureYear: draft.manufactureYear ? Number(draft.manufactureYear) : null,
      scale: draft.scale,
      condition: draft.condition,
      pricePaise: rupeesToPaise(draft.price),
      mrpPaise: rupeesToPaise(draft.mrp),
      lowStockThreshold: Number(draft.lowStockThreshold || 0),
      rare: draft.rare,
      offer: draft.offer.trim() || null,
      variantGroup: draft.variantGroup.trim(),
      variantLabel: draft.variantLabel.trim(),
      serialTracking: draft.serialTracking,
      description: draft.description,
    };
    if ((fields.mrpPaise as number) < (fields.pricePaise as number)) {
      setError('MRP cannot be lower than the selling price.');
      return;
    }
    setBusy(true);
    try {
      if (!product) {
        const result = await mutate<{ product: AdminProduct }>(
          '/admin/products',
          fields,
          csrfToken,
        );
        ui.toast('Draft created. Add the five photos, then publish.');
        await reloadProduct(result.product.id);
      } else {
        // Only changed fields are sent so locked fields (brand/series) are never touched by accident.
        const before = draftOf(product);
        const changed = Object.fromEntries(
          Object.entries(fields).filter(([key]) => {
            const draftKey =
              ({ pricePaise: 'price', mrpPaise: 'mrp' } as Record<string, keyof Draft>)[key] ||
              (key as keyof Draft);
            return draft[draftKey] !== before[draftKey];
          }),
        );
        if (!Object.keys(changed).length) {
          ui.toast('Nothing changed.');
        } else {
          await send('PATCH', `/admin/products/${product.id}`, changed, csrfToken);
          ui.toast('Collectible saved.');
          await reloadProduct(product.id);
        }
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(slot: number, file: File) {
    if (!product) return;
    const data = new FormData();
    data.append('image', file);
    setBusy(true);
    const ok = await ui.run(
      async () => {
        await request(`/admin/products/${product.id}/images/${slot}`, {
          method: 'PUT',
          headers: { 'X-CSRF-Token': csrfToken || '' },
          body: data,
        });
        await reloadProduct(product.id);
      },
      `${viewNames[slot - 1]} photo uploaded.`,
    );
    setBusy(false);
    return ok;
  }

  async function publish(live: boolean) {
    if (!product) return;
    setBusy(true);
    await ui.run(
      async () => {
        await mutate(
          `/admin/products/${product.id}/${live ? 'publish' : 'archive'}`,
          {},
          csrfToken,
        );
        await reloadProduct(product.id);
      },
      live ? 'Product is live for shoppers.' : 'Product archived.',
    );
    setBusy(false);
  }

  return (
    <Modal
      title={product ? `Edit ${product.name}` : 'Add collectible'}
      onClose={onClose}
      className="wide-modal"
    >
      <form onSubmit={save}>
        {product?.requiresReview && (
          <p className="notice">
            This CSV row had no product name. Replace its temporary import identifier before
            publishing.
          </p>
        )}
        {product && (
          <div className="cr-editor-status">
            <Badge
              status={product.published ? 'live' : 'draft'}
              label={product.published ? 'Live' : 'Draft'}
            />
            <span>
              {product.sku} · {product.available} in stock
            </span>
            <a
              className="text-link"
              href={`${apiBase}/admin/products/${product.id}/label.svg`}
              target="_blank"
              rel="noreferrer"
            >
              <Barcode size={15} /> Print label
            </a>
          </div>
        )}
        <div className="form-grid">
          <label className="span-2">
            Model name
            <input
              required
              maxLength={200}
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </label>
          <label>
            Brand
            <input
              list="cr-brands"
              required
              maxLength={100}
              value={draft.brand}
              disabled={!!product}
              onChange={(e) => set('brand', e.target.value)}
            />
            <datalist id="cr-brands">
              {brands.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </datalist>
          </label>
          <label>
            Series
            <input
              required
              maxLength={100}
              value={draft.series}
              disabled={!!product}
              onChange={(e) => set('series', e.target.value)}
            />
          </label>
          {product && (
            <small className="span-2 muted">
              Brand and series are fixed once a product code is issued. Create a new model for a
              different series.
            </small>
          )}
          <label>
            Year of manufacture
            <input
              type="number"
              min={1886}
              max={2100}
              value={draft.manufactureYear}
              onChange={(e) => set('manufactureYear', e.target.value)}
            />
          </label>
          <label>
            Scale
            <select value={draft.scale} onChange={(e) => set('scale', e.target.value)}>
              {[...new Set([...scales, draft.scale])].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select value={draft.condition} onChange={(e) => set('condition', e.target.value)}>
              {[...new Set([...conditions, draft.condition])].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Offer label (optional)
            <input
              list="cr-offers"
              maxLength={100}
              value={draft.offer}
              onChange={(e) => set('offer', e.target.value)}
            />
            <datalist id="cr-offers">
              <option>Starter Garage</option>
              <option>Collector Trio</option>
            </datalist>
          </label>
          <label>
            Variation group (optional)
            <input
              maxLength={160}
              placeholder="Shared code, e.g. r34-colours"
              value={draft.variantGroup}
              onChange={(e) => set('variantGroup', e.target.value)}
            />
          </label>
          <label>
            Variation label (optional)
            <input
              maxLength={160}
              placeholder="Shown to shoppers, e.g. Blue · 1:64"
              value={draft.variantLabel}
              onChange={(e) => set('variantLabel', e.target.value)}
            />
          </label>
          <label>
            Selling price (₹)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={draft.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </label>
          <label>
            MRP (₹)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={draft.mrp}
              onChange={(e) => set('mrp', e.target.value)}
            />
          </label>
          <label>
            Low-stock alert at
            <input
              type="number"
              min="0"
              max="10000"
              step="1"
              value={draft.lowStockThreshold}
              onChange={(e) => set('lowStockThreshold', e.target.value)}
            />
          </label>
          <div className="cr-checks">
            <label className="check-row">
              <input
                type="checkbox"
                checked={draft.rare}
                onChange={(e) => set('rare', e.target.checked)}
              />
              Rare / chase piece
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={draft.serialTracking}
                disabled={!!product && product.available > 0}
                onChange={(e) => set('serialTracking', e.target.checked)}
              />
              Number each physical car (serial labels)
            </label>
          </div>
          <label className="span-2">
            Description
            <textarea
              maxLength={10000}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary full" disabled={busy}>
          {product ? 'Save changes' : 'Create draft'} <ArrowRight size={17} />
        </button>
      </form>
      {product ? (
        <section className="cr-photos">
          <h3>FIVE PRODUCT VIEWS · {product.images.length}/5</h3>
          <p className="muted">
            JPEG, PNG, WebP, AVIF or HEIF. Photos are converted and optimised on upload. View names
            are pending the client’s confirmation.
          </p>
          <div className="cr-photo-grid">
            {viewNames.map((name, index) => {
              const slot = index + 1;
              const current = product.images.find((image) => image.slot === slot);
              return (
                <div className="cr-photo-slot" key={slot}>
                  <Photo url={current?.url} alt={`${product.name} ${name}`} />
                  <b>
                    {slot}. {name}
                  </b>
                  <label className="upload-label">
                    {current ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif,image/heif"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file) void upload(slot, file);
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <div className="cr-editor-actions">
            {product.published ? (
              <button className="btn" disabled={busy} onClick={() => void publish(false)}>
                Archive (hide from shop)
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy || product.images.length < 5 || product.requiresReview}
                onClick={() => void publish(true)}
              >
                Publish to the shop
              </button>
            )}
            {!product.published && product.requiresReview ? (
              <small className="muted">Add the real product name to clear admin review.</small>
            ) : (
              !product.published &&
              product.images.length < 5 && (
                <small className="muted">Add all five photos to publish.</small>
              )
            )}
            <Link className="text-link" to={`/admin/inventory?product=${product.id}`}>
              Adjust stock <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      ) : (
        <p className="muted">Photos and stock are added after the draft is created.</p>
      )}
    </Modal>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const ui = useUI();
  const { csrfToken } = useRole();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function stage(file: File) {
    setError('');
    if (file.size > 900 * 1024) {
      setError('Choose a CSV under 900 KB, or split the catalogue into several files.');
      return;
    }
    setBusy(true);
    try {
      setPreview(
        await mutate<ImportPreview>('/admin/imports', { csv: await file.text() }, csrfToken),
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    if (
      await ui.run(
        () => mutate(`/admin/imports/${preview.jobId}/commit`, {}, csrfToken),
        `${preview.rowCount} models imported as drafts. Add photos, then publish.`,
      )
    )
      onDone();
    setBusy(false);
  }

  return (
    <Modal title="Import products from CSV" onClose={onClose} className="wide-modal">
      <p>
        Use the template columns. Prices are in rupees. Products without a code get one from their
        series number. Imported models stay drafts until their five photos are added.
      </p>
      <label className="upload-label">
        Choose CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void stage(file);
          }}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <>
          <p role="status">
            <b>{preview.rowCount} rows</b> ·{' '}
            {preview.errorCount ? (
              <span className="red">{preview.errorCount} need fixing before import</span>
            ) : (
              <span className="saving">ready to import</span>
            )}
            {preview.rowCount > preview.preview.length &&
              ` · showing the first ${preview.preview.length}`}
          </p>
          <div className="table-wrap cr-import-table">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Model</th>
                  <th>Brand / series</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Code</th>
                  <th>Action</th>
                  <th>Problems</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row) => (
                  <tr key={row.rowNumber} className={row.errors.length ? 'cr-row-error' : ''}>
                    <td>{row.rowNumber}</td>
                    <td>{row.name || '—'}</td>
                    <td>
                      {row.brand}
                      <small>{row.series}</small>
                    </td>
                    <td>{row.pricePaise !== undefined ? money(row.pricePaise) : '—'}</td>
                    <td>{row.stock ?? 0}</td>
                    <td>{row.sku}</td>
                    <td>{row.action}</td>
                    <td>{row.errors.length ? row.errors.join(' ') : '✓'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn btn-primary full"
            disabled={busy || preview.errorCount > 0}
            onClick={() => void commit()}
          >
            Import {preview.rowCount} models <ArrowRight size={17} />
          </button>
        </>
      )}
    </Modal>
  );
}
