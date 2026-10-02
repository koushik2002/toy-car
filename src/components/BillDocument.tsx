import type { Bill } from '../types';
import { asset, dateTime, money } from '../services/format';
export default function BillDocument({ bill, className = '' }: { bill: Bill; className?: string }) {
  return (
    <article className={`bill-document ${className}`} aria-label={`Bill ${bill.id}`}>
      <header className="bill-heading">
        <img src={asset('assets/brand/logo.jpg')} alt="Tiny Kars" width="100" height="100" />
        <div>
          <h2>{bill.sellerName}</h2>
          {bill.sellerAddress && <p>{bill.sellerAddress}</p>}
          <p>{bill.gstEnabled ? `GSTIN: ${bill.gstin || 'Not configured'}` : 'No GST charged'}</p>
        </div>
        <div>
          <h3>BILL</h3>
          <b>{bill.id}</b>
          <p>{dateTime(bill.at)} IST</p>
          {bill.orderId && <p>Order: {bill.orderId}</p>}
        </div>
      </header>
      <section className="bill-customer">
        <small>BILL TO</small>
        <h3>{bill.customerName}</h3>
        <p>{bill.customerAddress}</p>
        <p>{bill.customerPhone}</p>
      </section>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item / SKU</th>
              {bill.gstEnabled && <th>HSN</th>}
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.items.map((item, index) => (
              <tr key={index}>
                <td>
                  {item.name}
                  {item.sku && <small>{item.sku}</small>}
                </td>
                {bill.gstEnabled && <td>{item.hsn || '—'}</td>}
                <td>{item.quantity}</td>
                <td>{money(item.price)}</td>
                <td>{money(item.quantity * item.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bill-totals">
        <p>
          <span>Subtotal</span>
          <b>{money(bill.subtotal)}</b>
        </p>
        {bill.discount > 0 && (
          <p>
            <span>Discount</span>
            <b>−{money(bill.discount)}</b>
          </p>
        )}
        <p>
          <span>Shipping</span>
          <b>{bill.shipping ? money(bill.shipping) : 'FREE'}</b>
        </p>
        <p>
          <span>{bill.gstEnabled ? `GST (${bill.gstRate}%)` : 'GST'}</span>
          <b>{bill.gstEnabled ? money(bill.gst) : 'Not charged'}</b>
        </p>
        <p className="bill-grand-total">
          <span>Total</span>
          <strong>{money(bill.total)}</strong>
        </p>
      </div>
      {bill.note && <p className="bill-note">{bill.note}</p>}
      <footer>
        <p>Thank you for collecting with Tiny Kars.</p>
        <small>Demo bill · saved in this browser · Designed by ShwaaS.ai</small>
      </footer>
    </article>
  );
}
