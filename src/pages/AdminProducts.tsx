import { useState } from 'react';
import { Search, Plus, Download, Upload, Pencil, Trash2, ArrowRight } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { saveProduct, deleteProduct } from '../services/inventory';
import { exportProducts, importProducts, downloadFile } from '../services/csv';
import { money, asset } from '../services/format';
import { uid } from '../services/storage';
import AdminLayout from '../components/AdminLayout';
import { Modal, ImageUpload, useUI, Empty } from '../components/UI';
import type { Product, Condition } from '../types';
export default function AdminProducts() {
  const state = useStore(),
    ui = useUI();
  const [q, setQ] = useState(''),
    [brand, setBrand] = useState(''),
    [edit, setEdit] = useState<Product | null>(null),
    [remove, setRemove] = useState<Product | null>(null);
  const products = state.products.filter(
    (p) =>
      (!brand || p.brand === brand) &&
      `${p.name} ${p.sku} ${p.brand}`.toLowerCase().includes(q.toLowerCase()),
  );
  const brands = [...new Set(state.products.map((p) => p.brand))];
  const newProduct = () =>
    setEdit({
      id: uid('p'),
      sku: `TK-${Date.now().toString().slice(-6)}`,
      name: '',
      brand: 'Hot Wheels',
      series: 'Mainline',
      scale: '1:64',
      condition: 'New',
      price: 249,
      mrp: 349,
      stock: 10,
      threshold: 3,
      rare: false,
      image: 'assets/products/car-0.webp',
      color: '#ef3340',
      description: 'A collector-worthy diecast model. Demo artwork is illustrative.',
      arrival: Date.now(),
      sold: 0,
      offer: '',
    });
  function field<K extends keyof Product>(key: K, value: Product[K]) {
    setEdit((p) => (p ? { ...p, [key]: value } : p));
  }
  return (
    <AdminLayout title="THE COLLECTIBLES.">
      <div className="admin-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search products"
            placeholder="Search name, SKU or brand"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter product brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <button
          className="btn btn-small"
          onClick={() => downloadFile('tiny-kars-products.csv', exportProducts())}
        >
          <Download size={15} /> Export CSV
        </button>
        <label className="btn btn-small upload-button">
          <Upload size={15} /> Import CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.size > 1024 * 1024) throw Error('Choose a CSV under 1 MB.');
                const text = await f.text();
                ui.run(() => {
                  const count = importProducts(text);
                  ui.toast(`${count} products imported. Inventory & sync logs updated.`);
                });
              } catch (err) {
                ui.toast((err as Error).message, true);
              }
              e.target.value = '';
            }}
          />
        </label>
        <button className="btn btn-primary btn-small" onClick={newProduct}>
          <Plus size={16} /> Add model
        </button>
      </div>
      <p className="muted">
        {products.length} models · Export a CSV to use as your import template.
      </p>
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Collectible</th>
                <th>SKU</th>
                <th>Brand / series</th>
                <th>Scale</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="table-product">
                      <img src={asset(p.image)} alt="" />
                      <span>
                        <b>{p.name}</b>
                        <small>
                          {p.condition}
                          {p.rare ? ' · ✦ Rare' : ''}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td>{p.sku}</td>
                  <td>
                    {p.brand}
                    <small>{p.series}</small>
                  </td>
                  <td>{p.scale}</td>
                  <td>{money(p.price)}</td>
                  <td>
                    <span className={p.stock <= p.threshold ? 'low' : ''}>{p.stock}</span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="icon-btn"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => setEdit({ ...p })}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => setRemove(p)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!products.length && <Empty title="No models match your search" />}
      </div>
      {edit && (
        <Modal
          title={
            state.products.some((p) => p.id === edit.id) ? 'Edit collectible' : 'Add collectible'
          }
          onClose={() => setEdit(null)}
          className="wide-modal"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ui.run(() => saveProduct(edit), 'Collectible saved.')) setEdit(null);
            }}
          >
            <div className="product-edit-layout">
              <div>
                <img className="edit-image" src={asset(edit.image)} alt="Product image preview" />
                <ImageUpload onChange={(v) => field('image', v)} />
                <small className="muted">PNG, JPG or WebP · up to 2 MB</small>
              </div>
              <div className="form-grid">
                <label className="span-2">
                  Model name
                  <input
                    required
                    value={edit.name}
                    onChange={(e) => field('name', e.target.value)}
                  />
                </label>
                <label>
                  SKU
                  <input required value={edit.sku} onChange={(e) => field('sku', e.target.value)} />
                </label>
                <label>
                  Brand
                  <input
                    list="brands"
                    required
                    value={edit.brand}
                    onChange={(e) => field('brand', e.target.value)}
                  />
                  <datalist id="brands">
                    {brands.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </datalist>
                </label>
                <label>
                  Series
                  <input value={edit.series} onChange={(e) => field('series', e.target.value)} />
                </label>
                <label>
                  Scale
                  <select value={edit.scale} onChange={(e) => field('scale', e.target.value)}>
                    {['1:64', '1:43', '1:32', '1:24', '1:18'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Condition
                  <select
                    value={edit.condition}
                    onChange={(e) => field('condition', e.target.value as Condition)}
                  >
                    {['New', 'Pre-owned', 'Card damaged'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Price (₹, before optional GST)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={edit.price}
                    onChange={(e) => field('price', Number(e.target.value))}
                  />
                </label>
                <label>
                  MRP (₹)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={edit.mrp}
                    onChange={(e) => field('mrp', Number(e.target.value))}
                  />
                </label>
                <label>
                  Stock
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={edit.stock}
                    onChange={(e) => field('stock', Number(e.target.value))}
                  />
                </label>
                <label>
                  Low-stock threshold
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={edit.threshold}
                    onChange={(e) => field('threshold', Number(e.target.value))}
                  />
                </label>
                <label>
                  Offer
                  <select value={edit.offer || ''} onChange={(e) => field('offer', e.target.value)}>
                    <option value="">No offer</option>
                    {state.offers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={edit.rare}
                    onChange={(e) => field('rare', e.target.checked)}
                  />
                  Rare / chase piece
                </label>
                <label className="span-2">
                  Description
                  <textarea
                    value={edit.description}
                    onChange={(e) => field('description', e.target.value)}
                  />
                </label>
              </div>
            </div>
            <button className="btn btn-primary full">
              Save collectible <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal title="Delete this collectible?" onClose={() => setRemove(null)}>
          <p>
            {remove.name} ({remove.sku}) will leave the catalogue. Existing orders retain their item
            and price snapshots.
          </p>
          <button
            className="btn btn-primary full"
            onClick={() => {
              if (ui.run(() => deleteProduct(remove.id), 'Collectible removed.')) setRemove(null);
            }}
          >
            Delete {remove.sku}
          </button>
        </Modal>
      )}
    </AdminLayout>
  );
}
