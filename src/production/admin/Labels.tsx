import { useEffect, useState } from 'react';
import { Minus, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { apiBase, request } from '../api';
import { Empty, useUI } from '../ui';
import type { AdminProduct } from './Products';
import { PageHeading } from './shared';

type Pick = {
  product: AdminProduct;
  copies: number;
  units: { id: string; serialCode: string }[] | null;
};

/** Builds an A4 sheet of model barcodes and, for numbered cars, one label per physical unit. */
export function LabelsPage() {
  const ui = useUI();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdminProduct[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  useEffect(() => {
    const id = setTimeout(() => {
      void request<{ items: AdminProduct[] }>(
        `/admin/products?limit=12${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`,
      ).then(
        (result) => setResults(result.items),
        () => setResults([]),
      );
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  function add(product: AdminProduct) {
    if (picks.some((pick) => pick.product.id === product.id)) return;
    setPicks([...picks, { product, copies: 1, units: null }]);
  }
  async function loadUnits(pick: Pick) {
    const ok = await ui.run(async () => {
      const result = await request<{ units: { id: string; serialCode: string; state: string }[] }>(
        `/admin/products/${pick.product.id}/units`,
      );
      const available = result.units.filter((unit) => unit.state === 'available');
      setPicks((current) =>
        current.map((item) =>
          item.product.id === pick.product.id ? { ...item, units: available } : item,
        ),
      );
    });
    if (!ok) return;
  }
  const labels = picks.flatMap((pick) =>
    pick.units
      ? pick.units.map((unit) => ({
          key: unit.id,
          src: `${apiBase}/admin/units/${unit.id}/label.svg`,
          title: pick.product.name,
          code: unit.serialCode,
        }))
      : Array.from({ length: pick.copies }, (_, index) => ({
          key: `${pick.product.id}-${index}`,
          src: `${apiBase}/admin/products/${pick.product.id}/label.svg`,
          title: pick.product.name,
          code: pick.product.sku,
        })),
  );

  return (
    <>
      <PageHeading title="LABELS, READY TO STICK." />
      <div className="cr-two-col cr-labels-tools">
        <div className="panel">
          <h2>CHOOSE MODELS</h2>
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Search products for labels"
              placeholder="Search name or code"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <div className="cr-list">
            {results.map((product) => (
              <div className="cr-list-row" key={product.id}>
                <span>
                  <b>{product.name}</b>
                  <small>
                    {product.sku} · {product.available} in stock
                    {product.serialTracking ? ' · numbered units' : ''}
                  </small>
                </span>
                <button
                  className="btn btn-small"
                  disabled={picks.some((pick) => pick.product.id === product.id)}
                  onClick={() => add(product)}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>ON THIS SHEET · {labels.length} LABELS</h2>
          {!picks.length && <p className="muted">Add models from the list.</p>}
          <div className="cr-list">
            {picks.map((pick) => (
              <div className="cr-list-row" key={pick.product.id}>
                <span>
                  <b>{pick.product.name}</b>
                  <small>
                    {pick.units
                      ? `${pick.units.length} numbered units`
                      : `${pick.copies} × ${pick.product.sku}`}
                  </small>
                </span>
                <span className="table-actions">
                  {!pick.units && (
                    <span className="quantity">
                      <button
                        aria-label={`Fewer labels for ${pick.product.name}`}
                        disabled={pick.copies <= 1}
                        onClick={() =>
                          setPicks(
                            picks.map((item) =>
                              item === pick ? { ...item, copies: item.copies - 1 } : item,
                            ),
                          )
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <span>{pick.copies}</span>
                      <button
                        aria-label={`More labels for ${pick.product.name}`}
                        disabled={pick.copies >= 100}
                        onClick={() =>
                          setPicks(
                            picks.map((item) =>
                              item === pick ? { ...item, copies: item.copies + 1 } : item,
                            ),
                          )
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </span>
                  )}
                  {pick.product.serialTracking && !pick.units && (
                    <button className="btn btn-small" onClick={() => void loadUnits(pick)}>
                      Every unit
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${pick.product.name}`}
                    onClick={() => setPicks(picks.filter((item) => item !== pick))}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary full"
            disabled={!labels.length}
            onClick={() => window.print()}
          >
            <Printer size={17} /> Print labels
          </button>
          <small className="muted">
            Prints on A4, three labels per row. Check one test page with your scanner first.
          </small>
        </div>
      </div>
      {labels.length ? (
        <div className="label-sheet" aria-label="Label preview">
          {labels.map((label) => (
            <figure key={label.key}>
              <img src={label.src} alt={`Barcode ${label.code}`} />
              <figcaption>{label.title}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <Empty title="No labels yet" detail="Choose models to preview the sheet." />
      )}
    </>
  );
}
