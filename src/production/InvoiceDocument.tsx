import { dateTime, money, type Invoice } from './api';

const paymentWords: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  online: 'Paid online',
  test: 'Local test payment',
};

/** Printable invoice in the demo's bill layout. Used by billing and the customer's order page. */
export function InvoiceDocument({
  invoice,
  className = '',
}: {
  invoice: Invoice;
  className?: string;
}) {
  const settings = invoice.settings_snapshot;
  const taxRate = settings.defaultTaxBps / 100;
  const showHsn = invoice.items.some((item) => item.hsn);
  return (
    <article
      className={`bill-document ${className}`}
      aria-label={`Invoice ${invoice.invoice_number}`}
    >
      <header className="bill-heading">
        <img
          src={`${import.meta.env.BASE_URL}assets/brand/logo.jpg`}
          alt="Tiny Kars"
          width="100"
          height="100"
        />
        <div>
          <h2>{settings.legalName}</h2>
          <p>{settings.gstin ? `GSTIN: ${settings.gstin}` : 'GST not registered'}</p>
        </div>
        <div>
          <h3>{settings.gstin ? 'TAX INVOICE' : 'INVOICE'}</h3>
          <b>{invoice.invoice_number}</b>
          <p>{dateTime(invoice.created_at)} IST</p>
          <p>{invoice.channel === 'online' ? 'Online order' : 'Counter sale'}</p>
        </div>
      </header>
      <section className="bill-customer">
        <small>BILL TO</small>
        <h3>{invoice.customer_name}</h3>
        {invoice.customer_address && <p>{invoice.customer_address}</p>}
        {(invoice.customer_phone || invoice.customer_email) && (
          <p>{[invoice.customer_phone, invoice.customer_email].filter(Boolean).join(' · ')}</p>
        )}
      </section>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item / code</th>
              {showHsn && <th>HSN</th>}
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={index}>
                <td>
                  {item.name}
                  {item.sku && item.sku !== 'CUSTOM' && <small>{item.sku}</small>}
                </td>
                {showHsn && <td>{item.hsn || '—'}</td>}
                <td>{item.quantity}</td>
                <td>{money(item.unit_price_paise)}</td>
                <td>{money(item.line_total_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bill-totals">
        <p>
          <span>Subtotal</span>
          <b>{money(invoice.subtotal_paise)}</b>
        </p>
        {invoice.discount_paise > 0 && (
          <p>
            <span>Discount</span>
            <b>−{money(invoice.discount_paise)}</b>
          </p>
        )}
        <p>
          <span>Shipping</span>
          <b>{invoice.shipping_paise ? money(invoice.shipping_paise) : 'FREE'}</b>
        </p>
        <p>
          <span>{invoice.tax_paise ? `Tax (${taxRate}%)` : 'Tax'}</span>
          <b>{invoice.tax_paise ? money(invoice.tax_paise) : 'Not charged'}</b>
        </p>
        <p className="bill-grand-total">
          <span>Total</span>
          <strong>{money(invoice.total_paise)}</strong>
        </p>
        {invoice.payment_method && (
          <p>
            <span>Payment</span>
            <b>{paymentWords[invoice.payment_method] || invoice.payment_method}</b>
          </p>
        )}
      </div>
      {invoice.note && <p className="bill-note">{invoice.note}</p>}
      <footer>
        <p>Thank you for collecting with Tiny Kars.</p>
        <small>Issued invoices cannot be changed.</small>
      </footer>
    </article>
  );
}
