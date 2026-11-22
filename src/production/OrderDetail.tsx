import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Download,
  Package,
  Printer,
  ReceiptText,
  RotateCcw,
  Truck,
  X,
} from 'lucide-react';
import {
  dateTime,
  apiBase,
  money,
  request,
  send,
  statusLabel,
  type CatalogueProduct,
  type Invoice,
  type OrderDetail,
} from './api';
import { useCart } from './cart';
import { InvoiceDocument } from './InvoiceDocument';
import { useSession } from './session';
import { Badge, Empty, ErrorPanel, Modal, PageLoading, Photo, useUI } from './ui';

const stages = ['paid', 'processing', 'shipped', 'out_for_delivery', 'delivered'] as const;
const stageHelp: Record<(typeof stages)[number], string> = {
  paid: 'We received your payment.',
  processing: 'Your models are being checked and packed.',
  shipped: 'On the road to you.',
  out_for_delivery: 'With the delivery team for the final leg.',
  delivered: 'Safely on your shelf.',
};

function useOrder(id: string | undefined) {
  const [order, setOrder] = useState<OrderDetail>();
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setError(undefined);
    void request<{ order: OrderDetail }>(`/orders/${id}`).then(
      (result) => live && setOrder(result.order),
      (failure: Error) => live && setError(failure),
    );
    return () => {
      live = false;
    };
  }, [id, attempt]);
  return { order, setOrder, error, reload: () => setAttempt((value) => value + 1) };
}

export function CustomerOrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const ui = useUI();
  const cart = useCart();
  const { csrfToken } = useSession();
  const { order, setOrder, error, reload } = useOrder(id);
  const [requestKind, setRequestKind] = useState<'cancel' | 'return' | null>(null);
  const [reason, setReason] = useState('');
  const [refundPreference, setRefundPreference] = useState<'source' | 'store_credit'>('source');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  if (error)
    return (
      <div className="container page">
        {error.message.toLowerCase().includes('not found') ? (
          <Empty title="Order not found" detail="This order isn’t linked to your account.">
            <Link to="/account/orders" className="btn btn-primary">
              My orders
            </Link>
          </Empty>
        ) : (
          <ErrorPanel error={error} retry={reload} />
        )}
      </div>
    );
  if (!order) return <PageLoading label="Loading your order…" />;

  const paymentState = new URLSearchParams(location.search).get('payment');
  const submitted = paymentState === 'submitted' || paymentState === 'confirmed';
  const reached = (stage: string) => order.timeline.find((event) => event.status === stage);
  const extras = order.timeline.filter(
    (event) =>
      !(stages as readonly string[]).includes(event.status) && event.status !== 'pending_payment',
  );
  const stopped = ['cancelled', 'refund_pending', 'refunded'].includes(order.status);
  const openRequest = order.requests.find((item) => item.status === 'open');

  async function reorder() {
    setBusy(true);
    const problems: string[] = [];
    let added = 0;
    for (const item of order!.items) {
      try {
        const { product } = await request<{ product: CatalogueProduct }>(
          `/products/${item.productId}`,
        );
        const already = cart.lines.find((line) => line.product.id === product.id)?.quantity ?? 0;
        const quantity = Math.min(item.quantity, product.available - already);
        if (quantity < 1) throw new Error(`${item.name} is sold out right now.`);
        cart.add(product, quantity);
        added += 1;
        if (quantity < item.quantity) problems.push(`Only ${quantity} of ${item.name} available.`);
      } catch (failure) {
        problems.push(
          failure instanceof Error && !failure.message.toLowerCase().includes('find')
            ? failure.message
            : `${item.name} is no longer available.`,
        );
      }
    }
    setBusy(false);
    problems.forEach((problem) => ui.toast(problem, true));
    if (added) {
      ui.toast('Models added to your garage.');
      navigate('/cart');
    }
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    if (!requestKind) return;
    setBusy(true);
    setFormError('');
    try {
      const result = await send<{ order: OrderDetail }>(
        'POST',
        `/orders/${order!.id}/requests`,
        { kind: requestKind, reason: reason.trim(), refundPreference },
        csrfToken,
      );
      setOrder(result.order);
      ui.toast(
        requestKind === 'cancel'
          ? 'Cancellation requested. We’ll confirm shortly.'
          : 'Return requested. We’ll be in touch.',
      );
      setRequestKind(null);
      setReason('');
    } catch (failure) {
      setFormError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const address = order.address;
  return (
    <div className="container page order-detail-page">
      <Link className="text-link" to="/account/orders">
        <ArrowLeft size={15} /> My orders
      </Link>
      {submitted && order.status === 'pending_payment' && (
        <div className="order-success">
          <div>
            <Clock size={32} />
          </div>
          <span className="eyebrow">PAYMENT SUBMITTED</span>
          <h1>
            ALMOST ON
            <br />
            YOUR SHELF.
          </h1>
          <p>
            We’re waiting for Razorpay to confirm your payment. This usually takes a moment —
            refresh this page shortly.
            <br />
            Please don’t pay again for this order while it shows “Waiting for payment”.
          </p>
        </div>
      )}
      {submitted && order.status !== 'pending_payment' && order.paidAt && (
        <div className="order-success">
          <div>
            <Check size={32} />
          </div>
          <span className="eyebrow">PAYMENT CONFIRMED</span>
          <h1>
            GOOD TASTE.
            <br />
            GREAT COLLECTION.
          </h1>
          <p>Thank you! We’ve emailed your confirmation and will start packing your models.</p>
        </div>
      )}
      <div className="section-top order-detail-heading">
        <div>
          <span className="eyebrow red">YOUR COLLECTIBLE JOURNEY</span>
          <h2>{order.orderNumber}</h2>
          <p className="muted">Placed {dateTime(order.createdAt)} IST</p>
        </div>
        <Badge status={order.status} />
      </div>
      <div className="order-detail-layout">
        <section>
          <div className="panel">
            <h2>
              <Truck size={19} /> THE JOURNEY TO YOUR GARAGE
            </h2>
            {order.status === 'pending_payment' && (
              <div className="notice">
                <Clock size={18} />
                <span>
                  Waiting for payment confirmation. Unpaid orders are released automatically after
                  15 minutes.
                </span>
              </div>
            )}
            <ol className="order-timeline">
              {stages.map((stage, index) => {
                const event = reached(stage);
                const current = order.status === stage;
                return (
                  <li key={stage} className={`${event ? 'done' : ''} ${current ? 'current' : ''}`}>
                    <span>{event ? <Check size={14} /> : index + 1}</span>
                    <div>
                      <b>{statusLabel(stage)}</b>
                      {event ? (
                        <small>{dateTime(event.at)} IST</small>
                      ) : (
                        <small>{stopped ? '—' : 'Coming up'}</small>
                      )}
                      {(event || current) && <small>{stageHelp[stage]}</small>}
                      {stage === 'shipped' && event && (order.courier || order.trackingNumber) && (
                        <small className="timeline-detail">
                          {[
                            order.courier,
                            order.trackingNumber && `Tracking ${order.trackingNumber}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      )}
                      {stage === 'delivered' && event && order.deliveryRecipient && (
                        <small className="timeline-detail">
                          Received by {order.deliveryRecipient}
                        </small>
                      )}
                    </div>
                  </li>
                );
              })}
              {extras.map((event, index) => (
                <li key={`${event.at}-${index}`} className="done terminal">
                  <span>
                    {event.status.endsWith('approved') ? (
                      <Check size={13} />
                    ) : event.status.endsWith('requested') ? (
                      <RotateCcw size={13} />
                    ) : (
                      <X size={13} />
                    )}
                  </span>
                  <div>
                    <b>{statusLabel(event.status)}</b>
                    <small>{dateTime(event.at)} IST</small>
                    {event.note && <p>{event.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="panel">
            <h2>
              <Package size={19} /> YOUR COLLECTIBLES
            </h2>
            {order.items.map((item) => (
              <div className="cart-line" key={`${item.productId}-${item.sku}`}>
                <Link to={`/product/${item.productId}`} aria-label={`View ${item.name}`}>
                  <Photo url={item.image} alt={item.name} />
                </Link>
                <div>
                  <b>{item.name}</b>
                  <small>
                    {[item.brand, item.scale, item.sku].filter(Boolean).join(' · ')} · Qty{' '}
                    {item.quantity}
                  </small>
                  <strong>{money(item.unitPricePaise)} each</strong>
                </div>
                <strong>{money(item.lineTotalPaise)}</strong>
              </div>
            ))}
          </div>
        </section>
        <aside>
          <div className="panel">
            <h2>DELIVERY DETAILS</h2>
            {address.recipientName && <b>{address.recipientName}</b>}
            <p>
              {[address.line1, address.line2].filter(Boolean).join(', ')}
              <br />
              {[address.city, address.state].filter(Boolean).join(', ')} {address.postalCode}
              {address.phone && (
                <>
                  <br />
                  {address.phone}
                </>
              )}
            </p>
            <hr />
            <h3>PAYMENT</h3>
            <div className="totals">
              <p>
                <span>Subtotal</span>
                <span>{money(order.subtotalPaise)}</span>
              </p>
              <p>
                <span>Shipping</span>
                <span>{order.shippingPaise ? money(order.shippingPaise) : 'FREE'}</span>
              </p>
              {order.voucherDiscountPaise > 0 && (
                <p className="saving">
                  <span>Voucher</span>
                  <span>−{money(order.voucherDiscountPaise)}</span>
                </p>
              )}
              {order.walletAppliedPaise > 0 && (
                <p className="saving">
                  <span>Store credit</span>
                  <span>−{money(order.walletAppliedPaise)}</span>
                </p>
              )}
              {order.loyaltyAppliedPaise > 0 && (
                <p className="saving">
                  <span>Loyalty points</span>
                  <span>−{money(order.loyaltyAppliedPaise)}</span>
                </p>
              )}
              {order.taxPaise > 0 && (
                <p>
                  <span>Tax</span>
                  <span>{money(order.taxPaise)}</span>
                </p>
              )}
              <p className="total">
                <strong>Total</strong>
                <strong>{money(order.totalPaise)}</strong>
              </p>
              <small>
                {order.paidAt ? `Paid ${dateTime(order.paidAt)} IST` : 'Payment not yet confirmed'}
              </small>
            </div>
            {order.invoice ? (
              <Link className="btn full" to={`/account/orders/${order.id}/invoice`}>
                <ReceiptText size={17} /> View invoice {order.invoice.invoiceNumber}
              </Link>
            ) : (
              <p className="muted invoice-pending">
                <ReceiptText size={14} /> Your invoice will appear here once it’s issued.
              </p>
            )}
          </div>
          <div className="panel order-actions">
            <button className="btn btn-primary full" disabled={busy} onClick={reorder}>
              <RotateCcw size={17} /> Reorder these models
            </button>
            {order.canCancel && !openRequest && (
              <button
                className="btn full"
                onClick={() => {
                  setFormError('');
                  setRequestKind('cancel');
                }}
              >
                Cancel order
              </button>
            )}
            {order.canReturn && !openRequest && (
              <button
                className="btn full"
                onClick={() => {
                  setFormError('');
                  setRequestKind('return');
                }}
              >
                Request a return
              </button>
            )}
            {order.requests.map((item) => (
              <div className={`request-status request-${item.status}`} key={item.id}>
                <Badge
                  status={item.status}
                  label={`${item.kind === 'cancel' ? 'Cancellation' : 'Return'} ${
                    item.status === 'open' ? 'under review' : item.status
                  }`}
                />
                <small>You said: “{item.reason}”</small>
                {item.resolutionNote && <small>Tiny Kars: {item.resolutionNote}</small>}
              </div>
            ))}
            <small className="muted">
              Cancel before we start packing. Returns within {order.returnWindowDays} days of
              delivery. Refunds go to your original payment method or store credit.
            </small>
          </div>
        </aside>
      </div>
      {requestKind && (
        <Modal
          title={requestKind === 'cancel' ? 'Cancel this order?' : 'Request a return'}
          onClose={() => setRequestKind(null)}
        >
          <form onSubmit={submitRequest}>
            <p>
              {requestKind === 'cancel'
                ? 'We’ll review your request before packing begins. Once approved, your refund is arranged automatically.'
                : 'Tell us what went wrong with your collectible. We’ll reply with return instructions.'}
            </p>
            <label>
              Reason
              <textarea
                required
                minLength={3}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  requestKind === 'cancel'
                    ? 'For example: ordered the wrong model'
                    : 'For example: card arrived damaged'
                }
              />
            </label>
            <label>
              If approved, refund to
              <select
                value={refundPreference}
                onChange={(event) =>
                  setRefundPreference(event.target.value as 'source' | 'store_credit')
                }
              >
                <option value="source">Original payment method</option>
                <option value="store_credit">Tiny Kars store credit</option>
              </select>
            </label>
            {formError && (
              <p className="form-message error" role="alert">
                {formError}
              </p>
            )}
            <button className="btn btn-primary full" disabled={busy}>
              {busy
                ? 'Sending…'
                : requestKind === 'cancel'
                  ? `Request cancellation of ${order.orderNumber}`
                  : 'Submit return request'}
              <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function CustomerInvoicePage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<Invoice>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    if (!id) return;
    let live = true;
    void request<{ invoice: Invoice }>(`/orders/${id}/invoice`).then(
      (result) => live && setInvoice(result.invoice),
      (failure: Error) => live && setError(failure),
    );
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <div className="container page invoice-page">
      <div className="invoice-toolbar">
        <Link className="text-link" to={`/account/orders/${id}`}>
          <ArrowLeft size={15} /> Back to order
        </Link>
        {invoice && (
          <>
            <a className="btn" href={`${apiBase}/orders/${id}/invoice/download`}>
              <Download size={17} /> Download invoice
            </a>
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={17} /> Print / Save PDF
            </button>
          </>
        )}
      </div>
      {error ? (
        <Empty
          title="Your invoice isn’t ready yet"
          detail="We issue the invoice once your order is confirmed. Please check back soon."
        >
          <Link className="btn btn-primary" to={`/account/orders/${id}`}>
            Back to order
          </Link>
        </Empty>
      ) : !invoice ? (
        <PageLoading label="Loading your invoice…" />
      ) : (
        <InvoiceDocument invoice={invoice} className="invoice-only bill-screen-preview" />
      )}
    </div>
  );
}
