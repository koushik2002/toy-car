import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, ArrowRight, ChevronRight } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { money } from '../services/format';
import ProductCard from '../components/ProductCard';
import { Empty, Modal } from '../components/UI';
const brands = [
  'Hot Wheels',
  'Mini GT',
  'Matchbox',
  'Majorette',
  'Bburago',
  'CCA',
  'Inno64',
  'Pop Race',
  'Tomica',
];
export default function Shop() {
  const state = useStore(),
    [params, setParams] = useSearchParams(),
    [drawer, setDrawer] = useState(false),
    [loading, setLoading] = useState(true),
    [limit, setLimit] = useState(24);
  const brand = params.get('brand') || '',
    series = params.get('series') || '',
    scale = params.get('scale') || '',
    max = Number(params.get('max') || 29999),
    q = params.get('q') || '',
    condition = params.get('condition') || '',
    rare = params.get('rare') === '1',
    stock = params.get('stock') === '1',
    offer = params.get('offer') || '',
    sort = params.get('sort') || 'newest';
  useEffect(() => {
    setLoading(true);
    setLimit(24);
    const id = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(id);
  }, [params.toString()]);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'brand') next.delete('series');
    setParams(next);
  }
  const matches = state.products
    .filter(
      (p) =>
        (!brand || p.brand === brand) &&
        (!series || p.series === series) &&
        (!scale || p.scale === scale) &&
        p.price <= max &&
        (!condition || p.condition === condition) &&
        (!rare || p.rare) &&
        (!stock || p.stock > 0) &&
        (!offer || p.offer === offer) &&
        (!q || `${p.name} ${p.brand} ${p.series} ${p.sku}`.toLowerCase().includes(q.toLowerCase())),
    )
    .sort((a, b) =>
      sort === 'price-low'
        ? a.price - b.price
        : sort === 'price-high'
          ? b.price - a.price
          : sort === 'popular'
            ? b.sold - a.sold
            : b.arrival - a.arrival,
    );
  const seriesList = [
    ...new Set(state.products.filter((p) => !brand || p.brand === brand).map((p) => p.series)),
  ];
  const filterBody = (
    <>
      <div className="filter-heading">
        <h3>Refine your garage</h3>
        <button className="text-link" onClick={() => setParams({})}>
          Reset
        </button>
      </div>
      <fieldset>
        <legend>Brand</legend>
        {brands.map((b) => (
          <label className="check-row" key={b}>
            <input
              type="checkbox"
              checked={brand === b}
              onChange={() => change('brand', brand === b ? '' : b)}
            />
            <span>{b}</span>
            <small>{state.products.filter((p) => p.brand === b).length}</small>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Series</legend>
        <select
          aria-label="Filter by series"
          value={series}
          onChange={(e) => change('series', e.target.value)}
        >
          <option value="">All series</option>
          {seriesList.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </fieldset>
      <fieldset>
        <legend>Scale</legend>
        <div className="filter-scale">
          {['1:64', '1:43', '1:32', '1:24', '1:18'].map((s) => (
            <button
              key={s}
              className={scale === s ? 'active' : ''}
              onClick={() => change('scale', scale === s ? '' : s)}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>
          Price ceiling <span>{money(max)}</span>
        </legend>
        <input
          className="price-range"
          aria-label="Maximum price"
          type="range"
          min="149"
          max="29999"
          step="50"
          value={max}
          onChange={(e) => change('max', e.target.value)}
        />
        <div className="range-labels">
          <span>₹149</span>
          <span>₹29,999</span>
        </div>
        <div className="quick-budgets">
          {[499, 799, 999, 1499].map((v) => (
            <button
              className={max === v ? 'active' : ''}
              key={v}
              onClick={() => change('max', String(v))}
            >
              Under {money(v)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Condition</legend>
        {['New', 'Pre-owned', 'Card damaged'].map((c) => (
          <label key={c} className="check-row">
            <input
              type="checkbox"
              checked={condition === c}
              onChange={() => change('condition', condition === c ? '' : c)}
            />
            {c}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>A little more specific</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={stock}
            onChange={() => change('stock', stock ? '' : '1')}
          />
          In stock only
        </label>
        <label className="check-row">
          <input type="checkbox" checked={rare} onChange={() => change('rare', rare ? '' : '1')} />✦
          Rare finds only
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={offer === 'bundle'}
            onChange={() => change('offer', offer ? '' : 'bundle')}
          />
          Any 3 for ₹550
        </label>
      </fieldset>
    </>
  );
  return (
    <div className="container page">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight size={13} />
        The collection
      </div>
      <div className="page-heading">
        <span className="eyebrow red">A LITTLE SOMETHING FOR EVERY SHELF</span>
        <h1>
          {rare
            ? 'THE RARE FINDS.'
            : offer
              ? 'BUILD YOUR BUNDLE.'
              : q
                ? `THE SEARCH: ${q.toUpperCase()}`
                : brand
                  ? `${brand.toUpperCase()}.`
                  : 'THE COLLECTION.'}
        </h1>
        <p>
          {offer
            ? 'Pick three marked Starter Garage models. The ₹550 offer applies automatically in your cart.'
            : 'From everyday favourites to once-in-a-lifetime finds. What drives you?'}
        </p>
      </div>
      <div className="shop-layout">
        <aside className="filter-sidebar">{filterBody}</aside>
        <div className="shop-results" data-tour="browse">
          <div className="shop-toolbar">
            <span>
              <strong>{matches.length}</strong> collectibles
            </span>
            <button className="btn btn-small filter-mobile" onClick={() => setDrawer(true)}>
              <SlidersHorizontal size={16} /> Filters
            </button>
            <label className="sort-label">
              Sort by{' '}
              <select
                value={sort}
                aria-label="Sort products"
                onChange={(e) => change('sort', e.target.value)}
              >
                <option value="newest">Latest drops</option>
                <option value="popular">Best sellers</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </select>
            </label>
          </div>
          {params.size > 0 && (
            <div className="active-filters">
              {Array.from(params.entries())
                .filter(([k]) => k !== 'sort')
                .map(([k, v]) => (
                  <button key={k} onClick={() => change(k, '')}>
                    {k === 'max'
                      ? `Under ${money(Number(v))}`
                      : k === 'stock'
                        ? 'In stock'
                        : k === 'rare'
                          ? 'Rare finds'
                          : k === 'offer'
                            ? 'Starter Garage'
                            : v}
                    <X size={12} />
                  </button>
                ))}
              <button onClick={() => setParams({})}>Clear all</button>
            </div>
          )}
          {loading ? (
            <div className="product-grid shop-grid" aria-label="Loading products">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton skeleton-card" />
              ))}
            </div>
          ) : matches.length ? (
            <>
              <div className="product-grid shop-grid">
                {matches.slice(0, limit).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {matches.length > limit && (
                <button className="btn load-more" onClick={() => setLimit((n) => n + 24)}>
                  Load more collectibles <ArrowRight size={16} />
                </button>
              )}
              <p className="result-caption">
                Showing {Math.min(matches.length, limit)} of {matches.length} models · Prices shown
                in INR
              </p>
            </>
          ) : (
            <Empty
              title="The hunt continues"
              detail="No models match these filters. Try widening your search."
            >
              <button className="btn btn-primary" onClick={() => setParams({})}>
                Reset filters
              </button>
            </Empty>
          )}
        </div>
      </div>
      {drawer && (
        <Modal title="Find your perfect model" onClose={() => setDrawer(false)} className="drawer">
          <div className="drawer-body mobile-filters">
            {filterBody}
            <button className="btn btn-primary full" onClick={() => setDrawer(false)}>
              Show {matches.length} collectibles <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
