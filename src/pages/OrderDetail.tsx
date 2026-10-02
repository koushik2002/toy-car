import { useState } from 'react';
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Check, Printer, Truck, RotateCcw, Package, X } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { money, dateTime, asset } from '../services/format';
import {
  cancelOrder,
  requestReturn,
  reorder,
  canReturn,
  advanceOrder,
  refundOrder,
  markCollected,
} from '../services/orders';
import { stages } from '../data/seed';
import { Badge, Empty, Modal, ImageUpload, useUI } from '../components/UI';
export default function OrderDetail() {
  const { id } = useParams(),
    state = useStore(),
    location = useLocation(),
    nav = useNavigate(),
    ui = useUI(),
    admin = location.pathname.startsWith('/admin');
  const o = state.orders.find((o) => o.id === id && (admin || o.userId === state.userId));
  const [returnOpen, setReturnOpen] = useState(false),
    [reason, setReason] = useState(''),
    [photo, setPhoto] = useState(''),
    [courier, setCourier] = useState('Demo Express'),
    [tracking, setTracking] = useState(''),
    [confirmCancel, setConfirmCancel] = useState(false);
  if (!o)
    return (
      <div className="container page">
        <Empty
          title="Order not found"
          detail="Switch to the collector who owns this order, or open the admin demo."
        >
          <Link to="/account" className="btn btn-primary">
            My account
          </Link>
        </Empty>
      </div>
    );
  const confirmed = new URLSearchParams(location.search).has('confirmed'),
    terminal = ['Cancelled', 'Return requested', 'Refunded'].includes(o.status);
  return (
    <div className="container page order-detail-page">
      <Link className="text-link" to={admin ? '/admin/orders' : '/account'}>
        <ArrowLeft size={15} /> {admin ? 'All orders' : 'My orders'}
      </Link>
      {confirmed && (
        <div className="order-success">
          <div>
            <Check size={32} />
          </div>
          <span className="eyebrow red">IT'S OFFICIALLY YOURS</span>
          <h1>
            GOOD TASTE.
            <br />
            GREAT COLLECTION.
          </h1>
          <p>
            Your demo order is placed and stock has been updated.
            <br />
            Your next shelf story is on its way.
          </p>
        </div>
      )}
      <div className="section-top order-detail-heading">
        <div>
          <span className="eyebrow red">
            {admin ? 'ADMIN ORDER DETAIL' : 'YOUR COLLECTIBLE JOURNEY'}
          </span>
          <h2>{o.id}</h2>
          <p className="muted">Placed {dateTime(o.at)} IST</p>
        </div>
        <Badge status={o.status} />
      </div>
      <div className="order-detail-layout">
        <section>
          <div className="panel">
            <h2>
              <Truck size={19} /> THE JOURNEY TO YOUR GARAGE
            </h2>
            <ol className="order-timeline">
              {stages.map((s, i) => {
                const event = o.timeline.find((e) => e.status === s),
                  active = o.status === s;
                return (
                  <li key={s} className={`${event ? 'done' : ''} ${active ? 'current' : ''}`}>
                    <span>{event ? <Check size={14} /> : i + 1}</span>
                    <div>
                      <b>{s}</b>
                      {event ? (
                        <small>{dateTime(event.at)} IST</small>
                      ) : (
                        <small>{terminal ? '—' : 'Coming up'}</small>
                      )}
                      {s === 'Shipped' && event && (
                        <small>
                          {o.courier} · {o.tracking}
                        </small>
                      )}
                    </div>
                  </li>
                );
              })}
              {terminal && (
                <li className="done terminal">
                  <span>
                    <X size={13} />
                  </span>
                  <div>
                    <b>{o.status}</b>
                    <small>{dateTime(o.timeline[o.timeline.length - 1].at)} IST</small>
                    {o.returnReason && <p>{o.returnReason}</p>}
                    {o.returnPhoto && (
                      <img
                        className="upload-preview"
                        src={o.returnPhoto}
                        alt="Customer return photo"
                      />
                    )}
                  </div>
                </li>
              )}
            </ol>
          </div>
          <div className="panel">
            <h2>
              <Package size={19} /> YOUR COLLECTIBLES
            </h2>
            {o.items.map((i) => (
              <div className="cart-line" key={i.productId}>
                <img src={asset(i.image)} alt={i.name} />
                <div>
                  <b>{i.name}</b>
                  <small>
                    {i.sku} · Qty {i.quantity}
                  </small>
                  <strong>{money(i.price)} each</strong>
                </div>
                <strong>{money(i.price * i.quantity)}</strong>
              </div>
            ))}
          </div>
        </section>
        <aside>
          <div className="panel">
            <h2>DELIVERY DETAILS</h2>
            <b>{o.address.name}</b>
            <p>
              {o.address.line}
              <br />
              {o.address.city}, {o.address.state} {o.address.pin}
              <br />
              {o.address.phone}
            </p>
            <hr />
            <h3>PAYMENT · {o.payment}</h3>
            <Badge
              status={
                o.paid ? 'Paid (demo)' : o.status === 'Refunded' ? 'Refunded' : 'Not collected'
              }
            />
            <div className="totals">
              <p>
                <span>Subtotal</span>
                <span>{money(o.subtotal)}</span>
              </p>
              {o.discount > 0 && (
                <p className="saving">
                  <span>Discounts</span>
                  <span>−{money(o.discount)}</span>
                </p>
              )}
              <p>
                <span>Shipping</span>
                <span>{o.shipping ? money(o.shipping) : 'FREE'}</span>
              </p>
              <p className="total">
                <strong>Total</strong>
                <strong>{money(o.total)}</strong>
              </p>
              <small>Includes {money(o.gst)} GST on goods.</small>
            </div>
            <button className="btn full" onClick={() => window.print()}>
              <Printer size={17} /> Print demo invoice
            </button>
          </div>
          <div className="panel order-actions">
            {admin ? (
              <>
                <h2>ADMIN ACTIONS</h2>
                {o.status === 'Packed' && (
                  <>
                    <label>
                      Courier
                      <input value={courier} onChange={(e) => setCourier(e.target.value)} />
                    </label>
                    <label>
                      Tracking ID
                      <input
                        value={tracking}
                        onChange={(e) => setTracking(e.target.value)}
                        placeholder="DEMO123456"
                      />
                    </label>
                  </>
                )}
                {stages.includes(o.status) && o.status !== 'Delivered' && (
                  <button
                    className="btn btn-primary full"
                    onClick={() =>
                      ui.run(
                        () => advanceOrder(o.id, courier, tracking),
                        'Order status updated. Customer timeline is now updated too.',
                      )
                    }
                  >
                    Advance to {stages[stages.indexOf(o.status) + 1]} <ArrowRight size={16} />
                  </button>
                )}
                {o.payment === 'COD' && !o.paid && o.status !== 'Refunded' && (
                  <button
                    className="btn full"
                    onClick={() =>
                      ui.run(() => markCollected(o.id), 'COD marked collected (demo).')
                    }
                  >
                    Mark COD collected
                  </button>
                )}
                {['Cancelled', 'Return requested'].includes(o.status) && (
                  <button
                    className="btn full"
                    onClick={() =>
                      ui.run(() => refundOrder(o.id), 'Demo refund processed; stock restored once.')
                    }
                  >
                    Process demo refund
                  </button>
                )}
                <Link className="text-link" to="/account">
                  Check customer timeline <ArrowRight size={15} />
                </Link>
              </>
            ) : (
              <>
                <button
                  className="btn btn-primary full"
                  onClick={() => {
                    if (ui.run(() => reorder(o.id), 'Models added to your garage.')) nav('/cart');
                  }}
                >
                  <RotateCcw size={17} /> Reorder these models
                </button>
                {['Placed', 'Confirmed'].includes(o.status) && (
                  <button className="btn full" onClick={() => setConfirmCancel(true)}>
                    Cancel order
                  </button>
                )}
                {canReturn(o) && (
                  <button className="btn full" onClick={() => setReturnOpen(true)}>
                    Request a return
                  </button>
                )}
                <small className="muted">
                  Cancellation before packing. Returns within 7 days of delivery.
                </small>
              </>
            )}
          </div>
        </aside>
      </div>
      <div className="invoice-only">
        <h1>TINY KARS</h1>
        <p>DEMO INVOICE · NOT A TAX INVOICE</p>
        <p>
          {o.id} · {dateTime(o.at)} IST
        </p>
        <p>
          Bill to: {o.address.name}
          <br />
          {o.address.line}, {o.address.city} {o.address.pin}
        </p>
        <table>
          <thead>
            <tr>
              <th>Model / SKU</th>
              <th>Qty</th>
              <th>Unit price (GST inclusive)</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.sku}>
                <td>
                  {i.name} · {i.sku}
                </td>
                <td>{i.quantity}</td>
                <td>{money(i.price)}</td>
                <td>{money(i.price * i.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Discounts: {money(o.discount)} · Shipping: {money(o.shipping)}
        </p>
        <h2>Total: {money(o.total)}</h2>
        <p>
          GST included on goods: {money(o.gst)} (demo 18%) · Payment: {o.payment}
        </p>
        <p>No money was charged. This document is for demonstration only.</p>
      </div>
      {returnOpen && (
        <Modal title="Request a return" onClose={() => setReturnOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                ui.run(
                  () => requestReturn(o.id, reason, photo),
                  'Return requested. The admin can review it.',
                )
              )
                setReturnOpen(false);
            }}
          >
            <p>Tell us what went wrong with your collectible.</p>
            <label>
              Reason
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: damaged in transit"
              />
            </label>
            <ImageUpload onChange={setPhoto} label="Optional photo (PNG/JPG/WebP, up to 2 MB)" />
            {photo && <img className="upload-preview" src={photo} alt="Return photo preview" />}
            <button className="btn btn-primary full">
              Submit return request <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {confirmCancel && (
        <Modal title="Cancel this order?" onClose={() => setConfirmCancel(false)}>
          <p>
            Your models will return to available stock. Any demo refund can be processed from the
            admin panel.
          </p>
          <button
            className="btn btn-primary full"
            onClick={() => {
              if (ui.run(() => cancelOrder(o.id), 'Order cancelled; stock restored.'))
                setConfirmCancel(false);
            }}
          >
            Cancel {o.id}
          </button>
        </Modal>
      )}
    </div>
  );
}
