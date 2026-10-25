import { useState } from 'react';
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Printer, Package, MessageCircle, Copy, RotateCcw } from 'lucide-react';
import BillDocument from '../components/BillDocument';
import { generateOrderBill } from '../services/billing';
import { whatsappOrderLink, orderMessage } from '../services/whatsapp';
import { useStore } from '../hooks/useStore';
import { money, dateTime, asset } from '../services/format';
import { cancelOrder, reorder, markCollected } from '../services/orders';
import { Badge, Empty, Modal, useUI } from '../components/UI';

export default function OrderDetail() {
  const { id } = useParams();
  const state = useStore();
  const location = useLocation();
  const nav = useNavigate();
  const ui = useUI();
  const admin = location.pathname.startsWith('/admin');
  const order = state.orders.find(
    (item) => item.id === id && (admin || item.userId === state.userId),
  );
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!order)
    return (
      <div className="container page">
        <Empty title="Request not found" detail="Open the collector account used for this request.">
          <Link to="/account" className="btn btn-primary">
            My account
          </Link>
        </Empty>
      </div>
    );

  const bill = state.bills.find((item) => item.orderId === order.id);
  const confirmed = new URLSearchParams(location.search).has('confirmed');
  const cancelled = ['Cancelled', 'Refunded'].includes(order.status);

  return (
    <div className="container page order-detail-page">
      <Link className="text-link" to={admin ? '/admin/orders' : '/account'}>
        <ArrowLeft size={15} /> {admin ? 'All requests' : 'My requests'}
      </Link>
      {confirmed && (
        <div className="order-success">
          <div>
            <Check size={32} />
          </div>
          <span className="eyebrow red">YOUR WHATSAPP REQUEST</span>
          <h1>
            GOOD TASTE.
            <br />
            GREAT COLLECTION.
          </h1>
          <p>
            This request is saved in your browser. Tap Send in WhatsApp to share it with Tiny Kars.
            <br />
            The shop will confirm availability and payment in the chat.
          </p>
        </div>
      )}
      <div className="section-top order-detail-heading">
        <div>
          <span className="eyebrow red">
            {admin ? 'WHATSAPP REQUEST RECORD' : 'YOUR WHATSAPP REQUEST'}
          </span>
          <h2>{order.id}</h2>
          <p className="muted">Saved {dateTime(order.at)} IST · Demo data on this device only</p>
        </div>
        {cancelled && <Badge status={order.status} />}
      </div>
      <div className="order-detail-layout">
        <section className="panel">
          <h2>
            <Package size={19} /> REQUESTED COLLECTIBLES
          </h2>
          {order.items.map((item) => (
            <div className="cart-line" key={item.productId}>
              <img src={asset(item.image)} alt={item.name} />
              <div>
                <b>{item.name}</b>
                <small>
                  {item.sku} · Qty {item.quantity}
                </small>
                <strong>{money(item.price)} each</strong>
              </div>
              <strong>{money(item.price * item.quantity)}</strong>
            </div>
          ))}
        </section>
        <aside>
          <div className="panel">
            <h2>CUSTOMER & BILLING</h2>
            <b>{order.address.name}</b>
            <p>
              {order.address.line}
              <br />
              {order.address.city}, {order.address.state} {order.address.pin}
              <br />
              {order.address.phone}
            </p>
            <hr />
            <h3>
              {order.payment === 'WhatsApp' ? 'PAYMENT ARRANGED ON WHATSAPP' : 'PAYMENT · COD'}
            </h3>
            <Badge
              status={order.paid ? 'Paid (demo)' : cancelled ? order.status : 'Payment pending'}
            />
            <div className="totals">
              <p>
                <span>Subtotal</span>
                <span>{money(order.subtotal)}</span>
              </p>
              {order.discount > 0 && (
                <p className="saving">
                  <span>Discounts</span>
                  <span>−{money(order.discount)}</span>
                </p>
              )}
              <p>
                <span>Shipping</span>
                <span>{order.shipping ? money(order.shipping) : 'FREE'}</span>
              </p>
              {order.gst > 0 && (
                <p>
                  <span>GST ({order.gstRate ?? 0}%)</span>
                  <span>{money(order.gst)}</span>
                </p>
              )}
              <p className="total">
                <strong>Total</strong>
                <strong>{money(order.total)}</strong>
              </p>
              <small>{order.gst > 0 ? 'GST included in the total.' : 'No GST charged.'}</small>
            </div>
            {!admin && order.payment === 'WhatsApp' && !cancelled && (
              <>
                <a
                  className="btn btn-whatsapp full"
                  href={whatsappOrderLink(state.commerce.whatsappNumber, order)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={17} /> Open request in WhatsApp
                </a>
                <button
                  className="btn full"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(orderMessage(order));
                      ui.toast('Request details copied.');
                    } catch {
                      ui.toast('Copy unavailable. Open WhatsApp instead.', true);
                    }
                  }}
                >
                  <Copy size={17} /> Copy request details
                </button>
              </>
            )}
            {!bill && !cancelled && (
              <button
                className="btn full"
                onClick={() =>
                  ui.run(() => {
                    const saved = generateOrderBill(order);
                    if (admin) nav(`/admin/billing?bill=${encodeURIComponent(saved.id)}`);
                  }, 'Bill generated and saved.')
                }
              >
                <Printer size={17} /> Generate bill
              </button>
            )}
            {admin && bill && (
              <button
                className="btn full"
                onClick={() => nav(`/admin/billing?bill=${encodeURIComponent(bill.id)}`)}
              >
                <Printer size={17} /> Open saved bill
              </button>
            )}
            {!admin && bill && (
              <button className="btn full" onClick={() => window.print()}>
                <Printer size={17} /> Print / Save PDF
              </button>
            )}
          </div>
          <div className="panel order-actions">
            {admin ? (
              <>
                <h2>BILLING ACTIONS</h2>
                {!order.paid && !cancelled && (
                  <button
                    className="btn full"
                    onClick={() =>
                      ui.run(() => markCollected(order.id), 'Payment marked received (demo).')
                    }
                  >
                    Mark payment received
                  </button>
                )}
                <p className="muted">
                  This browser demo cannot verify whether the WhatsApp message was sent or payment
                  was received.
                </p>
              </>
            ) : (
              <>
                <button
                  className="btn btn-primary full"
                  onClick={() => {
                    if (ui.run(() => reorder(order.id), 'Models added to your garage.'))
                      nav('/cart');
                  }}
                >
                  <RotateCcw size={17} /> Add these models again
                </button>
                {['Placed', 'Confirmed'].includes(order.status) && (
                  <button className="btn full" onClick={() => setConfirmCancel(true)}>
                    Cancel request
                  </button>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
      {bill && <BillDocument bill={bill} className="invoice-only" />}
      {confirmCancel && (
        <Modal title="Cancel this request?" onClose={() => setConfirmCancel(false)}>
          <p>The demo restores the reserved stock on this device.</p>
          <button
            className="btn btn-primary full"
            onClick={() => {
              if (ui.run(() => cancelOrder(order.id), 'Request cancelled; demo stock restored.'))
                setConfirmCancel(false);
            }}
          >
            Cancel {order.id}
          </button>
        </Modal>
      )}
    </div>
  );
}
