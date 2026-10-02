import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Printer, ReceiptText, Save, Settings2 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import BillDocument from '../components/BillDocument';
import { useUI } from '../components/UI';
import { useStore } from '../hooks/useStore';
import { billTotals, generateBill, saveCommerceSettings } from '../services/billing';
import { money, dateTime } from '../services/format';
import type { BillLine } from '../types';
export default function AdminBilling() {
  const state = useStore(),
    ui = useUI(),
    [params, setParams] = useSearchParams();
  const selected = state.bills.find((b) => b.id === params.get('bill'));
  const [settings, setSettings] = useState({ ...state.commerce });
  const [customerName, setCustomerName] = useState(''),
    [customerPhone, setCustomerPhone] = useState(''),
    [customerAddress, setCustomerAddress] = useState(''),
    [discount, setDiscount] = useState(0),
    [shipping, setShipping] = useState(0),
    [note, setNote] = useState('Thank you for your order!');
  const [items, setItems] = useState<BillLine[]>([
    { name: '', sku: '', price: 0, quantity: 1, hsn: '' },
  ]);
  const rate = state.commerce.gstEnabled ? state.commerce.gstRate : 0;
  let totals;
  try {
    totals = billTotals(items, discount, shipping, rate);
  } catch {
    totals = null;
  }
  function updateLine(index: number, value: Partial<BillLine>) {
    setItems((lines) => lines.map((line, i) => (i === index ? { ...line, ...value } : line)));
  }
  return (
    <AdminLayout title="BILLS, MADE SIMPLE.">
      <div className="billing-page">
        <div className="billing-intro">
          <div>
            <span className="eyebrow">TINY KARS / BILLING DESK</span>
            <h2>From your garage to their shelf.</h2>
            <p>Create a bill for an online or offline order. Save it, then print or save as PDF.</p>
          </div>
          <span className={`billing-tax-state ${state.commerce.gstEnabled ? 'enabled' : ''}`}>
            {state.commerce.gstEnabled ? `GST enabled · ${rate}%` : 'GST off · no tax charged'}
          </span>
        </div>
        <div className="billing-actions">
          <button className="btn" onClick={() => setParams({})}>
            <Plus size={16} />
            New bill
          </button>
          <label>
            Saved bills
            <select
              aria-label="Saved bills"
              value={selected?.id ?? ''}
              onChange={(e) => setParams(e.target.value ? { bill: e.target.value } : {})}
            >
              <option value="">Create a new bill</option>
              {state.bills.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} · {b.customerName} · {money(b.total)}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={17} />
              Print / Save PDF
            </button>
          )}
        </div>
        {selected ? (
          <>
            <div className="notice">
              <ReceiptText size={18} />
              <span>
                Saved {dateTime(selected.at)} IST. Use your browser’s print dialog to print or save
                as PDF.
              </span>
            </div>
            <BillDocument bill={selected} className="invoice-only bill-screen-preview" />
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ui.run(() => {
                const bill = generateBill({
                  customerName,
                  customerPhone,
                  customerAddress,
                  items,
                  discount,
                  shipping,
                  note,
                });
                setParams({ bill: bill.id });
              }, 'Bill generated and saved.');
            }}
          >
            <div className="billing-workspace">
              <section className="panel billing-form">
                <h2>01 CUSTOMER DETAILS</h2>
                <label>
                  Choose a collector
                  <select
                    aria-label="Choose a collector"
                    defaultValue=""
                    onChange={(e) => {
                      const user = state.users.find((u) => u.id === e.target.value);
                      if (user) {
                        const a = user.addresses[0];
                        setCustomerName(user.name);
                        setCustomerPhone(user.phone);
                        setCustomerAddress(a ? `${a.line}, ${a.city}, ${a.state} ${a.pin}` : '');
                      } else {
                        setCustomerName('');
                        setCustomerPhone('');
                        setCustomerAddress('');
                      }
                    }}
                  >
                    <option value="">New / walk-in customer</option>
                    {state.users
                      .filter((u) => u.role === 'customer')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="billing-field-grid">
                  <label>
                    Customer name
                    <input
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Vishwas"
                    />
                  </label>
                  <label>
                    Customer phone
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[6-9][0-9]{9}"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="10-digit mobile (optional)"
                    />
                  </label>
                </div>
                <label>
                  Customer address
                  <textarea
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Delivery or billing address (optional)"
                  />
                </label>
                <h2>02 COLLECTIBLES</h2>
                <div className="billing-lines">
                  {items.map((item, index) => (
                    <div className="billing-line" key={index}>
                      <div className="billing-line-heading">
                        <b>ITEM {String(index + 1).padStart(2, '0')}</b>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={items.length === 1}
                          aria-label={`Remove bill item ${index + 1}`}
                          onClick={() => setItems((lines) => lines.filter((_, i) => i !== index))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <label>
                        Catalogue model
                        <select
                          aria-label={`Catalogue model ${index + 1}`}
                          value={state.products.find((p) => p.sku === item.sku)?.id ?? ''}
                          onChange={(e) => {
                            const product = state.products.find((p) => p.id === e.target.value);
                            updateLine(
                              index,
                              product
                                ? { name: product.name, sku: product.sku, price: product.price }
                                : { name: '', sku: '', price: 0 },
                            );
                          }}
                        >
                          <option value="">Custom item</option>
                          {state.products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.sku}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Item name
                        <input
                          aria-label={`Item name ${index + 1}`}
                          required
                          value={item.name}
                          onChange={(e) => updateLine(index, { name: e.target.value })}
                        />
                      </label>
                      <div className="billing-field-grid">
                        <label>
                          SKU
                          <input
                            aria-label={`Item SKU ${index + 1}`}
                            value={item.sku}
                            onChange={(e) => updateLine(index, { sku: e.target.value })}
                          />
                        </label>
                        <label>
                          HSN (future GST)
                          <input
                            aria-label={`Item HSN ${index + 1}`}
                            value={item.hsn ?? ''}
                            onChange={(e) => updateLine(index, { hsn: e.target.value })}
                            placeholder="Optional"
                          />
                        </label>
                        <label>
                          Quantity
                          <input
                            aria-label={`Item quantity ${index + 1}`}
                            type="number"
                            required
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLine(index, { quantity: e.target.valueAsNumber })
                            }
                          />
                        </label>
                        <label>
                          Unit price (₹)
                          <input
                            aria-label={`Item price ${index + 1}`}
                            type="number"
                            required
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={(e) => updateLine(index, { price: e.target.valueAsNumber })}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    setItems((lines) => [
                      ...lines,
                      { name: '', sku: '', price: 0, quantity: 1, hsn: '' },
                    ])
                  }
                >
                  <Plus size={16} />
                  Add item
                </button>
                <h2>03 FINAL DETAILS</h2>
                <div className="billing-field-grid">
                  <label>
                    Bill discount (₹)
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.valueAsNumber)}
                    />
                  </label>
                  <label>
                    Bill shipping (₹)
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={shipping}
                      onChange={(e) => setShipping(e.target.valueAsNumber)}
                    />
                  </label>
                </div>
                <label>
                  Bill note
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </section>
              <aside className="summary-card billing-summary">
                <span className="eyebrow red">BILL SUMMARY</span>
                <h2>READY FOR THE RECORD.</h2>
                <div className="totals">
                  <p>
                    <span>Items</span>
                    <b>{items.length}</b>
                  </p>
                  <p>
                    <span>Subtotal</span>
                    <b>{totals ? money(totals.subtotal) : '—'}</b>
                  </p>
                  <p>
                    <span>Discount</span>
                    <b>{Number.isFinite(discount) ? money(discount) : '—'}</b>
                  </p>
                  <p>
                    <span>Shipping</span>
                    <b>{Number.isFinite(shipping) ? money(shipping) : '—'}</b>
                  </p>
                  <p>
                    <span>{rate ? `GST (${rate}%)` : 'GST'}</span>
                    <b>{rate && totals ? money(totals.gst) : 'Not charged'}</b>
                  </p>
                  <p className="total">
                    <strong>Total</strong>
                    <strong>{totals ? money(totals.total) : '—'}</strong>
                  </p>
                </div>
                <button className="btn btn-primary full">
                  <ReceiptText size={18} />
                  Generate bill
                </button>
                <p className="muted">
                  Bills are saved in this browser. Creating a manual bill does not change inventory.
                </p>
                <p className="muted">
                  For an existing order, use Generate bill on its order detail to keep the same
                  totals.
                </p>
              </aside>
            </div>
          </form>
        )}
        <details className="panel billing-settings">
          <summary>
            <Settings2 size={18} />
            Business & GST settings<span>WhatsApp · seller details · future GST</span>
          </summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ui.run(
                () => saveCommerceSettings(settings),
                'Business settings saved. New bills and orders use these settings.',
              );
            }}
          >
            <div className="billing-field-grid">
              <label>
                Business name
                <input
                  required
                  value={settings.sellerName}
                  onChange={(e) => setSettings({ ...settings, sellerName: e.target.value })}
                />
              </label>
              <label>
                Order WhatsApp number
                <input
                  type="tel"
                  required
                  value={settings.whatsappNumber}
                  onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
                />
              </label>
            </div>
            <label>
              Business address
              <textarea
                value={settings.sellerAddress}
                onChange={(e) => setSettings({ ...settings, sellerAddress: e.target.value })}
                placeholder="Add the shop address for your bills"
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.gstEnabled}
                onChange={(e) => setSettings({ ...settings, gstEnabled: e.target.checked })}
              />
              Enable GST for future bills and orders
            </label>
            <p className="muted">
              GST is currently off. The rate and GSTIN fields are reserved for future use. Enabling
              GST adds the configured percentage to discounted goods; shipping is unchanged. Saved
              bills retain their original amounts.
            </p>
            <div className="billing-field-grid">
              <label>
                GSTIN (future)
                <input
                  value={settings.gstin}
                  onChange={(e) => setSettings({ ...settings, gstin: e.target.value })}
                  placeholder="Add when GST is applicable"
                  maxLength={15}
                />
              </label>
              <label>
                GST rate (%)
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.gstRate}
                  onChange={(e) => setSettings({ ...settings, gstRate: e.target.valueAsNumber })}
                />
              </label>
            </div>
            <button className="btn btn-primary">
              <Save size={16} />
              Save business settings
            </button>
          </form>
        </details>
      </div>
    </AdminLayout>
  );
}
