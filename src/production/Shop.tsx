import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { catalogueQuery, money, request, type CatalogueProduct, type CatalogueResult } from './api';
import { ProductCard } from './ProductCard';
import { useOverview } from './Layout';
import { Empty, ErrorPanel, Modal } from './ui';

const budgets = [499, 799, 999, 1499];
const defaultScales = ['1:64', '1:43', '1:32', '1:24', '1:18'];

export function ShopPage() {
  const [params, setParams] = useSearchParams();
  const overview = useOverview();
  const [drawer, setDrawer] = useState(false);
  const [items, setItems] = useState<CatalogueProduct[]>([]);
  const [result, setResult] = useState<CatalogueResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  const brand = params.get('brand') || '';
  const series = params.get('series') || '';
  const scale = params.get('scale') || '';
  const condition = params.get('condition') || '';
  const year = params.get('year') || '';
  const q = params.get('q') || '';
  const rare = params.get('rare') === 'true';
  const inStock = params.get('inStock') === 'true';
  const offer = params.get('offer') || '';
  const sort = params.get('sort') || 'newest';
  // The slider works in whole rupees; the API filters in paise.
  const ceilingRupees = Math.max(
    1499,
    Math.ceil((overview?.priceRangePaise.max ?? 2999900) / 100 / 50) * 50,
  );
  const maxPrice = params.get('maxPrice') ? Number(params.get('maxPrice')) / 100 : ceilingRupees;
  const [slider, setSlider] = useState(maxPrice);
  useEffect(() => setSlider(maxPrice), [maxPrice]);

  const query = (() => {
    const copy = new URLSearchParams(params);
    copy.delete('cursor');
    return catalogueQuery(copy);
  })();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void request<CatalogueResult>(`/products?${query}`, { signal: controller.signal }).then(
      (value) => {
        setResult(value);
        setItems(value.items);
        setLoading(false);
      },
      (reason: Error) => {
        if (reason.name === 'AbortError') return;
        setError(reason);
        setLoading(false);
      },
    );
    return () => controller.abort();
  }, [query, attempt]);

  async function loadMore() {
    if (!result?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await request<CatalogueResult>(
        `/products?${query}&cursor=${encodeURIComponent(result.nextCursor)}`,
      );
      setItems((current) => [...current, ...next.items]);
      setResult(next);
    } catch (reason) {
      setError(reason as Error);
    } finally {
      setLoadingMore(false);
    }
  }

  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'brand') next.delete('series');
    next.delete('cursor');
    setParams(next);
  }

  const brands = overview?.brands ?? [];
  const seriesList = brand
    ? (brands.find((entry) => entry.name === brand)?.series ?? [])
    : (result?.facets.series ?? []);
  const scales = overview?.scales.length
    ? overview.scales.map((entry) => entry.name)
    : defaultScales;
  const conditions = result?.facets.conditions.length
    ? result.facets.conditions
    : ['New', 'Pre-owned', 'Card damaged'];
  const total = result?.total ?? 0;
  const chips = [...params.entries()].filter(([key]) => !['sort', 'cursor'].includes(key));
  const chipLabel = (key: string, value: string) =>
    key === 'maxPrice'
      ? `Under ${money(Number(value))}`
      : key === 'inStock'
        ? 'In stock'
        : key === 'rare'
          ? 'Rare finds'
          : key === 'q'
            ? `“${value}”`
            : key === 'year'
              ? `Made in ${value}`
              : value;

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
        {brands.map((entry) => (
          <label className="check-row" key={entry.name}>
            <input
              type="checkbox"
              checked={brand === entry.name}
              onChange={() => change('brand', brand === entry.name ? '' : entry.name)}
            />
            <span>{entry.name}</span>
            <small>{entry.total}</small>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Series</legend>
        <select
          aria-label="Filter by series"
          value={series}
          onChange={(event) => change('series', event.target.value)}
        >
          <option value="">All series</option>
          {seriesList.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </fieldset>
      <fieldset>
        <legend>Scale</legend>
        <div className="filter-scale">
          {scales.map((value) => (
            <button
              key={value}
              className={scale === value ? 'active' : ''}
              aria-pressed={scale === value}
              onClick={() => change('scale', scale === value ? '' : value)}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>
          Price ceiling <span>{money(slider * 100)}</span>
        </legend>
        <input
          className="price-range"
          aria-label="Maximum price"
          type="range"
          min="0"
          max={ceilingRupees}
          step="50"
          value={Math.min(slider, ceilingRupees)}
          onChange={(event) => setSlider(Number(event.target.value))}
          onPointerUp={() =>
            change('maxPrice', slider >= ceilingRupees ? '' : String(slider * 100))
          }
          onKeyUp={() => change('maxPrice', slider >= ceilingRupees ? '' : String(slider * 100))}
        />
        <div className="range-labels">
          <span>₹0</span>
          <span>{money(ceilingRupees * 100)}</span>
        </div>
        <div className="quick-budgets">
          {budgets.map((value) => (
            <button
              className={maxPrice === value ? 'active' : ''}
              key={value}
              onClick={() => change('maxPrice', String(value * 100))}
            >
              Under {money(value * 100)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Condition</legend>
        {conditions.map((value) => (
          <label key={value} className="check-row">
            <input
              type="checkbox"
              checked={condition === value}
              onChange={() => change('condition', condition === value ? '' : value)}
            />
            {value}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Year of manufacture</legend>
        <select
          aria-label="Filter by year of manufacture"
          value={year}
          onChange={(event) => change('year', event.target.value)}
        >
          <option value="">Any year</option>
          {(result?.facets.years ?? []).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </fieldset>
      <fieldset>
        <legend>A little more specific</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={inStock}
            onChange={() => change('inStock', inStock ? '' : 'true')}
          />
          In stock only
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={rare}
            onChange={() => change('rare', rare ? '' : 'true')}
          />
          ✦ Rare finds only
        </label>
        {(result?.facets.offers ?? []).map((value) => (
          <label className="check-row" key={value}>
            <input
              type="checkbox"
              checked={offer === value}
              onChange={() => change('offer', offer === value ? '' : value)}
            />
            {value}
          </label>
        ))}
      </fieldset>
    </>
  );

  const heading = rare
    ? 'THE RARE FINDS.'
    : offer
      ? `${offer.toUpperCase()}.`
      : q
        ? `THE SEARCH: ${q.toUpperCase()}`
        : brand
          ? `${brand.toUpperCase()}.`
          : scale
            ? `${scale} SCALE.`
            : 'THE COLLECTION.';

  return (
    <div className="container page">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight size={13} />
        The collection
      </div>
      <div className="page-heading">
        <span className="eyebrow red">A LITTLE SOMETHING FOR EVERY SHELF</span>
        <h1>{heading}</h1>
        <p>
          {offer
            ? `Models marked ${offer}. Offer terms are confirmed at checkout.`
            : 'From everyday favourites to once-in-a-lifetime finds. What drives you?'}
        </p>
      </div>
      <div className="shop-layout">
        <aside className="filter-sidebar" aria-label="Product filters">
          {filterBody}
        </aside>
        <div className="shop-results" aria-busy={loading}>
          <div className="shop-toolbar">
            <span role="status">
              <strong>{loading ? '…' : total}</strong> collectibles
            </span>
            <button className="btn btn-small filter-mobile" onClick={() => setDrawer(true)}>
              <SlidersHorizontal size={16} /> Filters{chips.length ? ` (${chips.length})` : ''}
            </button>
            <label className="sort-label">
              Sort by{' '}
              <select
                value={sort}
                aria-label="Sort products"
                onChange={(event) => change('sort', event.target.value)}
              >
                <option value="newest">Latest drops</option>
                <option value="popular">Best sellers</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
              </select>
            </label>
          </div>
          {chips.length > 0 && (
            <div className="active-filters">
              {chips.map(([key, value]) => (
                <button
                  key={key}
                  aria-label={`Remove filter ${chipLabel(key, value)}`}
                  onClick={() => change(key, '')}
                >
                  {chipLabel(key, value)}
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
          ) : error && !items.length ? (
            <ErrorPanel error={error} retry={() => setAttempt((value) => value + 1)} />
          ) : items.length ? (
            <>
              <div className="product-grid shop-grid">
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              {result?.nextCursor && (
                <button className="btn load-more" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? 'Loading…' : 'Load more collectibles'} <ArrowRight size={16} />
                </button>
              )}
              <p className="result-caption">
                Showing {items.length} of {total} models · Prices shown in INR
              </p>
            </>
          ) : (
            <Empty
              title="The hunt continues"
              detail={
                chips.length
                  ? 'No models match these filters. Try widening your search.'
                  : 'The collection is being prepared. Please check back soon.'
              }
            >
              {chips.length > 0 && (
                <button className="btn btn-primary" onClick={() => setParams({})}>
                  Reset filters
                </button>
              )}
            </Empty>
          )}
        </div>
      </div>
      {drawer && (
        <Modal title="Find your perfect model" onClose={() => setDrawer(false)} className="drawer">
          <div className="drawer-body mobile-filters">
            {filterBody}
            <button className="btn btn-primary full" onClick={() => setDrawer(false)}>
              Show {total} collectibles <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
