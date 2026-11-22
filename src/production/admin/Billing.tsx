import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { dateTime, money, mutate, request, apiBase, type Invoice } from '../api';
import { InvoiceDocument } from '../InvoiceDocument';
import { Badge, Empty, ErrorPanel, PageLoading, useUI } from '../ui';
import { useResource } from '../useResource';
import { newKey, PageHeading, rupeesToPaise, useRole } from './shared';

type InvoiceSummary = {
  id: string;
  invoice_number: string;
  order_id: string | null;
  channel: 'online' | 'offline';
  customer_name: string;
  total_paise: number;
  created_at: string;
};
type EligibleOrder = {
  id: string;
  total_paise: number;
  status: string;
  created_at: string;
  customer_name: string;
  email: string;
};
type BillingSettings = {
  id: string;
  legalName: string;
  gstin: string | null;
  invoicePrefix: string;
  defaultTaxBps: number;
  active: boolean;
};
type Line = {
  key: string;
  product: BillingProduct | null;
  custom: boolean;
  name: string;
  price: string;
  quantity: number;
  hsn: string;
};
type BillingProduct = {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  series: string;
  pricePaise: number;
  available: number;
  serialTracking: boolean;
};
const blankLine = (custom = false): Line => ({
  key: newKey(),
  product: null,
  custom,
  name: '',
  price: '',
  quantity: 1,
  hsn: '',
});
const payments = [
  ['cash', 'Cash'],
  ['upi', 'UPI'],
  ['card', 'Card'],
  ['bank_transfer', 'Bank transfer'],
] as const;

export function BillingPage() {
  const ui = useUI();
  const navigate = useNavigate();
  const { csrfToken, manager, superAdmin } = useRole();
  const invoices = useResource<{ items: InvoiceSummary[] }>('/billing/invoices');
  const eligible = useResource<{ items: EligibleOrder[] }>(
    manager ? '/billing/eligible-orders' : null,
  );
  const active = useResource<{ settings: BillingSettings | null }>('/billing/settings/active');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [payment, setPayment] = useState('cash');
  const [shipping, setShipping] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [note, setNote] = useState('Thank you for collecting with Tiny Kars!');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Kept for the whole form so a double submit cannot issue two invoices.
  const [billKey, setBillKey] = useState(newKey);

  function reset() {
    setCustomer({ name: '', phone: '', email: '', address: '' });
    setLines([blankLine()]);
    setPayment('cash');
    setShipping('0');
    setDiscount('0');
    setError('');
    setBillKey(newKey());
  }
  const taxBps = active.data?.settings?.defaultTaxBps ?? null;
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => {
      const unit = line.custom ? rupeesToPaise(line.price) : line.product?.pricePaise || 0;
      return sum + unit * (Number.isFinite(line.quantity) ? line.quantity : 0);
    }, 0);
    const discountPaise = manager ? Math.min(rupeesToPaise(discount), subtotal) : 0;
    const shippingPaise = rupeesToPaise(shipping);
    const tax = taxBps === null ? 0 : Math.floor(((subtotal - discountPaise) * taxBps) / 10000);
    return {
      subtotal,
      discountPaise,
      shippingPaise,
      tax,
      total: subtotal - discountPaise + shippingPaise + tax,
    };
  }, [lines, discount, shipping, taxBps, manager]);

  const update = (key: string, value: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...value } : line)));

  async function generate(event: FormEvent) {
    event.preventDefault();
    setError('');
    const ready = lines.filter((line) => line.product || (line.custom && line.name.trim()));
    if (!ready.length) {
      setError('Add at least one collectible.');
      return;
    }
    if (lines.some((line) => !line.custom && !line.product)) {
      setError('Choose a catalogue model for every item, or remove the empty item.');
      return;
    }
    const ids = ready.filter((line) => line.product).map((line) => line.product!.id);
    if (new Set(ids).size !== ids.length) {
      setError('Each catalogue model can appear once. Increase its quantity instead.');
      return;
    }
    setBusy(true);
    try {
      const result = await mutate<{ invoice: { id: string } }>(
        '/billing/invoices',
        {
          channel: 'offline',
          customerName: customer.name.trim(),
          customerPhone: customer.phone.trim(),
          customerEmail: customer.email.trim(),
          customerAddress: customer.address.trim(),
          paymentMethod: payment,
          note: note.trim(),
          shippingPaise: totals.shippingPaise,
          ...(manager && totals.discountPaise ? { discountPaise: totals.discountPaise } : {}),
          items: ready.map((line) =>
            line.custom
              ? {
                  name: line.name.trim(),
                  unitPricePaise: rupeesToPaise(line.price),
                  quantity: line.quantity,
                  ...(line.hsn ? { hsn: line.hsn } : {}),
                }
              : {
                  productId: line.product!.id,
                  quantity: line.quantity,
                  ...(line.hsn ? { hsn: line.hsn } : {}),
                },
          ),
          idempotencyKey: billKey,
        },
        csrfToken,
      );
      ui.toast('Bill generated. Stock updated and queued for Tally.');
      setBillKey(newKey());
      navigate(`/admin/billing/invoices/${result.invoice.id}`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function invoiceOnline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const orderId = String(new FormData(event.currentTarget).get('orderId') || '');
    setBusy(true);
    await ui.run(async () => {
      const result = await mutate<{ invoice: { id: string } }>(
        '/billing/invoices',
        { channel: 'online', orderId, idempotencyKey: newKey() },
        csrfToken,
      );
      navigate(`/admin/billing/invoices/${result.invoice.id}`);
    }, 'Online invoice issued.');
    setBusy(false);
  }

  return (
    <>
      <PageHeading title="BILLS, MADE SIMPLE." />
      <div className="billing-page">
        <div className="billing-intro">
          <div>
            <span className="eyebrow">TINY KARS / BILLING DESK</span>
            <h2>From your garage to their shelf.</h2>
            <p>
              {manager
                ? 'Create a bill for a counter sale or a paid online order.'
                : 'Create a bill for a counter sale using current catalogue prices and stock.'}{' '}
              Issued bills get the next invoice number and can’t be edited; print or save them as
              PDF.
            </p>
          </div>
          <img
            className="billing-mascot"
            src={`${import.meta.env.BASE_URL}assets/brand/mascot.webp`}
            alt=""
            aria-hidden="true"
            width="720"
            height="1080"
            loading="lazy"
          />
          <span className={`billing-tax-state ${taxBps ? 'enabled' : ''}`}>
            {active.data?.settings === null
              ? 'Billing not set up yet'
              : taxBps === null
                ? 'Tax added at the active rate'
                : taxBps
                  ? `Tax ${taxBps / 100}% · ${active.data!.settings!.invoicePrefix}`
                  : `No tax charged · ${active.data!.settings!.invoicePrefix}`}
          </span>
        </div>
        <div className="billing-actions">
          <button className="btn" type="button" onClick={reset}>
            <Plus size={16} /> New bill
          </button>
          <label>
            Saved bills
            <select
              aria-label="Saved bills"
              value=""
              onChange={(event) =>
                event.target.value && navigate(`/admin/billing/invoices/${event.target.value}`)
              }
            >
              <option value="">Open an issued bill…</option>
              {invoices.data?.items.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number} · {invoice.customer_name} · {money(invoice.total_paise)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <form onSubmit={generate}>
          <div className="billing-workspace">
            <section className="panel billing-form">
              <h2>01 CUSTOMER DETAILS</h2>
              <div className="billing-field-grid">
                <label>
                  Customer name
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                    placeholder="Walk-in customer"
                  />
                </label>
                <label>
                  Customer phone
                  <input
                    type="tel"
                    inputMode="tel"
                    maxLength={30}
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                    placeholder="10-digit mobile (optional)"
                  />
                </label>
              </div>
              <label>
                Customer email (optional)
                <input
                  type="email"
                  maxLength={320}
                  value={customer.email}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                />
              </label>
              <label>
                Customer address (optional)
                <textarea
                  maxLength={500}
                  value={customer.address}
                  onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                  placeholder="Delivery or billing address"
                />
              </label>
              <h2>02 COLLECTIBLES</h2>
              <div className="billing-lines">
                {lines.map((line, index) => (
                  <BillLine
                    key={line.key}
                    line={line}
                    index={index}
                    canRemove={lines.length > 1}
                    onChange={(value) => update(line.key, value)}
                    onRemove={() =>
                      setLines((current) => current.filter((item) => item.key !== line.key))
                    }
                  />
                ))}
              </div>
              <div className="cr-editor-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={() => setLines([...lines, blankLine()])}
                >
                  <Plus size={16} /> Add catalogue item
                </button>
                {manager && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setLines([...lines, blankLine(true)])}
                  >
                    <Plus size={16} /> Add custom item
                  </button>
                )}
              </div>
              <h2>03 FINAL DETAILS</h2>
              <div className="billing-field-grid">
                <label>
                  Payment received by
                  <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                    {payments.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Bill shipping (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shipping}
                    onChange={(e) => setShipping(e.target.value)}
                  />
                </label>
                {manager && (
                  <label>
                    Bill discount (₹)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                    />
                  </label>
                )}
              </div>
              <label>
                Bill note
                <textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </section>
            <aside className="summary-card billing-summary">
              <span className="eyebrow red">BILL SUMMARY</span>
              <h2>READY FOR THE RECORD.</h2>
              <div className="totals">
                <p>
                  <span>Items</span>
                  <b>
                    {lines.reduce(
                      (sum, line) => sum + (line.product || line.custom ? line.quantity || 0 : 0),
                      0,
                    )}
                  </b>
                </p>
                <p>
                  <span>Subtotal</span>
                  <b>{money(totals.subtotal)}</b>
                </p>
                {manager && (
                  <p>
                    <span>Discount</span>
                    <b>{totals.discountPaise ? `−${money(totals.discountPaise)}` : money(0)}</b>
                  </p>
                )}
                <p>
                  <span>Shipping</span>
                  <b>{totals.shippingPaise ? money(totals.shippingPaise) : 'FREE'}</b>
                </p>
                <p>
                  <span>{taxBps ? `Tax (${taxBps / 100}%)` : 'Tax'}</span>
                  <b>
                    {taxBps === null
                      ? 'At active rate'
                      : taxBps
                        ? money(totals.tax)
                        : 'Not charged'}
                  </b>
                </p>
                <p className="total">
                  <strong>Total</strong>
                  <strong>{money(totals.total)}</strong>
                </p>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn btn-primary full" disabled={busy}>
                <ReceiptText size={18} /> {busy ? 'Issuing…' : 'Generate bill'}
              </button>
              <p className="muted">
                Catalogue items reduce website stock when the bill is issued. Issued bills are sent
                to Tally once the connector is set up.
              </p>
            </aside>
          </div>
        </form>
        {manager && (
          <div className="panel">
            <h2>INVOICE A PAID ONLINE ORDER</h2>
            {eligible.data?.items.length ? (
              <form className="cr-inline-form" onSubmit={invoiceOnline}>
                <label>
                  Order
                  <select name="orderId" required>
                    {eligible.data.items.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.customer_name} · {money(order.total_paise)} ·{' '}
                        {dateTime(order.created_at)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-primary" disabled={busy}>
                  Issue online invoice
                </button>
              </form>
            ) : (
              <p className="muted">Every paid online order already has an invoice.</p>
            )}
          </div>
        )}
        <div className="panel table-panel">
          <h2>ISSUED BILLS</h2>
          {invoices.data?.items.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Sale</th>
                    <th>Total</th>
                    <th>Issued (IST)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.items.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link to={`/admin/billing/invoices/${invoice.id}`}>
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td>{invoice.customer_name}</td>
                      <td>
                        <Badge
                          status={invoice.channel === 'online' ? 'shipped' : 'confirmed'}
                          label={invoice.channel === 'online' ? 'Online' : 'Counter'}
                        />
                      </td>
                      <td>{money(invoice.total_paise)}</td>
                      <td>{dateTime(invoice.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No bills issued yet" />
          )}
        </div>
        {superAdmin && <BillingSettingsPanel onActivated={active.reload} />}
      </div>
    </>
  );
}

function BillLine({
  line,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  line: Line;
  index: number;
  canRemove: boolean;
  onChange: (value: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<BillingProduct[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (line.custom || !open) return;
    const id = setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      void request<{ items: BillingProduct[] }>(
        `/billing/products?q=${encodeURIComponent(q.trim())}`,
      ).then(
        (result) => setResults(result.items),
        () => setResults([]),
      );
    }, 250);
    return () => clearTimeout(id);
  }, [q, open, line.custom]);
  const number = String(index + 1).padStart(2, '0');
  return (
    <div className="billing-line">
      <div className="billing-line-heading">
        <b>
          ITEM {number}
          {line.custom ? ' · CUSTOM' : ''}
        </b>
        <button
          type="button"
          className="icon-btn"
          disabled={!canRemove}
          aria-label={`Remove bill item ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {line.custom ? (
        <div className="billing-field-grid">
          <label>
            Item name
            <input
              aria-label={`Item name ${index + 1}`}
              required
              minLength={2}
              maxLength={200}
              value={line.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>
          <label>
            Unit price (₹)
            <input
              aria-label={`Item price ${index + 1}`}
              type="number"
              min="0"
              step="0.01"
              required
              value={line.price}
              onChange={(e) => onChange({ price: e.target.value })}
            />
          </label>
        </div>
      ) : (
        <div className="cr-picker">
          <label>
            Catalogue model
            <span className="search-input">
              <Search size={16} />
              <input
                aria-label={`Catalogue model ${index + 1}`}
                placeholder="Type a name or scan a code"
                value={open ? q : line.product ? `${line.product.name} · ${line.product.sku}` : q}
                onFocus={() => {
                  setOpen(true);
                  setQ('');
                }}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(event) => {
                  // A barcode scanner types the code and presses Enter: pick the exact match.
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const exact = results.find(
                      (p) =>
                        p.sku.toUpperCase() === q.trim().toUpperCase() ||
                        p.barcode.toUpperCase() === q.trim().toUpperCase(),
                    );
                    const pick = exact || (results.length === 1 ? results[0] : null);
                    if (pick) {
                      onChange({ product: pick, quantity: 1 });
                      setOpen(false);
                      (event.target as HTMLInputElement).blur();
                    }
                  }
                }}
              />
            </span>
          </label>
          {open && (
            <div className="cr-picker-results" role="listbox">
              {results.length ? (
                results.map((product) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={line.product?.id === product.id}
                    key={product.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange({ product, quantity: 1 });
                      setOpen(false);
                    }}
                  >
                    <span>
                      <b>{product.name}</b>
                      <small>
                        {product.sku} · {product.available} in stock
                      </small>
                    </span>
                    <strong>{money(product.pricePaise)}</strong>
                  </button>
                ))
              ) : (
                <p className="muted">No in-stock model matches.</p>
              )}
            </div>
          )}
        </div>
      )}
      <div className="billing-field-grid">
        <label>
          Quantity
          <input
            aria-label={`Item quantity ${index + 1}`}
            type="number"
            min="1"
            max={line.product ? Math.min(100, line.product.available) : 100}
            step="1"
            required
            value={Number.isFinite(line.quantity) ? line.quantity : ''}
            onChange={(e) => onChange({ quantity: e.target.valueAsNumber })}
          />
        </label>
        <label>
          HSN code (optional)
          <input
            aria-label={`Item HSN ${index + 1}`}
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            maxLength={8}
            value={line.hsn}
            onChange={(e) => onChange({ hsn: e.target.value.replace(/\D/g, '') })}
            placeholder="e.g. 9503"
          />
        </label>
      </div>
      {line.product && (
        <small className="muted">
          {money(line.product.pricePaise)} each · {line.product.available} in stock
        </small>
      )}
    </div>
  );
}

function BillingSettingsPanel({ onActivated }: { onActivated: () => void }) {
  const ui = useUI();
  const { csrfToken } = useRole();
  const list = useResource<{ items: BillingSettings[] }>('/admin/billing-settings');
  const [busy, setBusy] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    if (
      await ui.run(
        () =>
          mutate(
            '/admin/billing-settings',
            {
              legalName: String(data.get('legalName') || '').trim(),
              gstin:
                String(data.get('gstin') || '')
                  .trim()
                  .toUpperCase() || null,
              invoicePrefix: String(data.get('prefix') || '')
                .trim()
                .toUpperCase(),
              defaultTaxBps: Math.round(Number(data.get('taxPercent') || 0) * 100),
            },
            csrfToken,
          ),
        'Settings saved as a draft. Activate them to use on new bills.',
      )
    ) {
      form.reset();
      list.reload();
    }
    setBusy(false);
  }
  async function activate(settings: BillingSettings) {
    if (
      await ui.run(
        () => mutate(`/admin/billing-settings/${settings.id}/activate`, {}, csrfToken),
        'New bills now use these settings.',
      )
    ) {
      list.reload();
      onActivated();
    }
  }
  return (
    <details className="panel billing-settings">
      <summary>
        <Settings2 size={18} />
        Business & tax settings<span>Legal name · GSTIN · invoice prefix · tax rate</span>
      </summary>
      <p className="muted">
        Enter only accountant-approved values. Each issued bill keeps a copy of the settings it
        used.
      </p>
      <form onSubmit={create}>
        <div className="billing-field-grid">
          <label>
            Legal business name
            <input name="legalName" required minLength={2} maxLength={200} />
          </label>
          <label>
            GSTIN (optional)
            <input name="gstin" pattern="[0-9A-Za-z]{15}" maxLength={15} />
          </label>
          <label>
            Invoice prefix
            <input name="prefix" pattern="[A-Za-z0-9-]{2,12}" required placeholder="TK" />
          </label>
          <label>
            Tax rate (%)
            <input
              name="taxPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue="0"
              required
            />
          </label>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          <Save size={16} /> Save settings draft
        </button>
      </form>
      <div className="cr-list">
        {list.data?.items.map((settings) => (
          <div className="cr-list-row" key={settings.id}>
            <span>
              <b>
                {settings.legalName} · {settings.invoicePrefix}
              </b>
              <small>
                {settings.gstin ? `GSTIN ${settings.gstin}` : 'No GSTIN'} · tax{' '}
                {settings.defaultTaxBps / 100}%
              </small>
            </span>
            {settings.active ? (
              <Badge status="live" label="Active" />
            ) : (
              <button
                className="btn btn-small"
                type="button"
                onClick={() => void activate(settings)}
              >
                Activate
              </button>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export function InvoicePage() {
  const { id } = useParams();
  const { manager } = useRole();
  const invoice = useResource<{ invoice: Invoice }>(id ? `/billing/invoices/${id}` : null);
  if (invoice.loading) return <PageLoading label="Loading invoice…" />;
  if (invoice.error || !invoice.data)
    return (
      <ErrorPanel error={invoice.error || new Error('Invoice not found.')} retry={invoice.reload} />
    );
  const value = invoice.data.invoice;
  return (
    <div className="billing-page">
      <PageHeading title={value.invoice_number} kicker="TINY KARS / ISSUED BILL" />
      <div className="billing-actions">
        <Link className="btn" to="/admin/billing">
          <ArrowLeft size={16} /> Billing desk
        </Link>
        {value.order_id && (
          <Link className="btn" to={`/admin/orders/${value.order_id}`}>
            Open order
          </Link>
        )}
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={17} /> Print / Save PDF
        </button>
        <a
          className="btn"
          href={`${apiBase}/billing/invoices/${value.id}/download`}
          download={`${value.invoice_number}.html`}
        >
          <Download size={17} /> Download invoice
        </a>
      </div>
      <div className="notice">
        <ReceiptText size={18} />
        <span>
          Issued {dateTime(value.created_at)} IST. Issued bills cannot be changed. Use your
          browser’s print dialog to print or save as PDF.
        </span>
      </div>
      <InvoiceDocument invoice={value} className="invoice-only bill-screen-preview" />
      {!!value.corrections?.length && (
        <section className="panel invoice-corrections">
          <h2>Correction history</h2>
          <p className="muted">
            The issued invoice remains unchanged. These records are append-only.
          </p>
          <div className="cr-list">
            {value.corrections.map((correction) => (
              <div className="cr-list-row" key={correction.id}>
                <span>
                  <b>{correction.correction_number}</b>
                  <small>
                    {correction.kind.replaceAll('_', ' ')} · {dateTime(correction.created_at)}
                  </small>
                  <small>{correction.reason}</small>
                </span>
                {correction.amount_paise > 0 && <b>{money(correction.amount_paise)}</b>}
              </div>
            ))}
          </div>
        </section>
      )}
      {manager && id && <InvoiceCorrectionForm invoiceId={id} onSaved={invoice.reload} />}
    </div>
  );
}

function InvoiceCorrectionForm({ invoiceId, onSaved }: { invoiceId: string; onSaved: () => void }) {
  const ui = useUI();
  const { csrfToken } = useRole();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    const saved = await ui.run(
      () =>
        mutate(
          `/admin/billing/invoices/${invoiceId}/corrections`,
          {
            kind: String(data.get('kind')),
            reason: String(data.get('reason') || '').trim(),
            amountPaise: rupeesToPaise(String(data.get('amount') || '0')),
            idempotencyKey: newKey(),
          },
          csrfToken,
        ),
      'Correction recorded without changing the issued invoice.',
    );
    if (saved) {
      form.reset();
      onSaved();
    }
    setBusy(false);
  }
  return (
    <details className="panel billing-settings">
      <summary>
        <Settings2 size={18} /> Record an invoice correction
      </summary>
      <p className="muted">
        This adds an audited note or credit/void notice. It never overwrites the issued invoice.
      </p>
      <form onSubmit={submit}>
        <div className="billing-field-grid">
          <label>
            Correction type
            <select name="kind" required defaultValue="note">
              <option value="note">Correction note</option>
              <option value="credit_note">Credit-note record</option>
              <option value="void_notice">Void notice</option>
            </select>
          </label>
          <label>
            Amount (₹, if applicable)
            <input name="amount" type="number" min="0" step="0.01" defaultValue="0" />
          </label>
        </div>
        <label>
          Reason
          <textarea name="reason" required minLength={3} maxLength={1000} />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          <Save size={16} /> {busy ? 'Recording…' : 'Record correction'}
        </button>
      </form>
    </details>
  );
}
