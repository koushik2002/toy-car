import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  MessageSquareWarning,
  Package,
  ReceiptText,
  Search,
  Truck,
  X,
} from 'lucide-react';
import {
  dateTime,
  money,
  mutate,
  request,
  statusLabel,
  type OrderDetail,
  type OrderSummary,
} from '../api';
import { Badge, Empty, ErrorPanel, PageLoading, Photo, useUI } from '../ui';
import { useResource } from '../useResource';
import { newKey, PageHeading, useRole } from './shared';

const statuses = [
  'paid',
  'processing',
  'shipped',
  'delivered',
  'pending_payment',
  'cancelled',
  'refund_pending',
  'refunded',
];

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const { staff } = useRole();
  const [q, setQ] = useState(params.get('q') || '');
  const status = params.get('status') || '';
  const openOnly = params.get('request') === 'open';
  const paramsKey = params.toString();
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(paramsKey);
      if (q.trim()) next.set('q', q.trim());
      else next.delete('q');
      if (next.toString() !== paramsKey) setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [paramsKey, q, setParams]);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  const query = new URLSearchParams();
  for (const key of ['q', 'status', 'request'])
    if (params.get(key)) query.set(key, params.get(key)!);
  const orders = useResource<{ items: OrderSummary[] }>(`/admin/orders?${query}`);
  const items = orders.data?.items || [];
  return (
    <>
      <PageHeading title="THE ORDER LINEUP." />
      <div className="admin-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search orders"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Order number, collector, email or tracking"
          />
        </div>
        <select
          aria-label="Order status filter"
          value={status}
          onChange={(event) => change('status', event.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
        <label className="check-row">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(event) => change('request', event.target.checked ? 'open' : '')}
          />
          Open customer requests
        </label>
      </div>
      <p className="muted">
        {orders.loading
          ? 'Loading orders…'
          : `${items.length} orders · ${
              staff
                ? 'Open a shipped order to confirm delivery.'
                : 'Open an order to pack it, add tracking, confirm delivery or answer a request.'
            }`}
      </p>
      <div className="panel table-panel">
        {orders.error ? (
          <ErrorPanel error={orders.error} retry={orders.reload} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Collector</th>
                  <th>When (IST)</th>
                  <th>Status</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/admin/orders/${order.id}`}>{order.orderNumber}</Link>
                      {order.latestRequest?.status === 'open' && (
                        <small className="cr-flag">
                          <MessageSquareWarning size={13} />{' '}
                          {order.latestRequest.kind === 'cancel'
                            ? 'Cancel request'
                            : 'Return request'}
                        </small>
                      )}
                    </td>
                    <td>
                      {order.customerName || '—'}
                      <small>{order.city || order.customerEmail}</small>
                    </td>
                    <td>{dateTime(order.createdAt)}</td>
                    <td>
                      <Badge status={order.status} />
                    </td>
                    <td>
                      {order.itemCount}
                      <small>{order.firstItemName}</small>
                    </td>
                    <td>
                      <b>{money(order.totalPaise)}</b>
                    </td>
                    <td>
                      <Link
                        className="icon-btn"
                        aria-label={`Open order ${order.orderNumber}`}
                        to={`/admin/orders/${order.id}`}
                      >
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!orders.loading && !orders.error && !items.length && (
          <Empty title="No orders match" detail="Try another status or clear the search." />
        )}
      </div>
    </>
  );
}

const stages = ['paid', 'processing', 'shipped', 'out_for_delivery', 'delivered'] as const;

export function OrderDeskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ui = useUI();
  const { csrfToken, staff, manager } = useRole();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [courier, setCourier] = useState('');
  const [tracking, setTracking] = useState('');
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [decisionNote, setDecisionNote] = useState('');

  const load = useCallback(async () => {
    try {
      setOrder((await request<{ order: OrderDetail }>(`/admin/orders/${id}`)).order);
      setError(null);
    } catch (reason) {
      setError(reason as Error);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorPanel error={error} retry={() => void load()} />;
  if (!order) return <PageLoading label="Loading order…" />;

  async function advance(
    event: FormEvent,
    status: 'processing' | 'shipped' | 'out_for_delivery' | 'delivered',
  ) {
    event.preventDefault();
    setBusy(true);
    const ok = await ui.run(
      async () => {
        const result = await mutate<{ order: OrderDetail }>(
          `/admin/orders/${order!.id}/status`,
          {
            status,
            idempotencyKey: newKey(),
            ...(status === 'shipped'
              ? { courier: courier.trim(), trackingNumber: tracking.trim() }
              : {}),
            ...(status === 'delivered' ? { recipient: recipient.trim() } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
          csrfToken,
        );
        setOrder(result.order);
      },
      status === 'processing'
        ? 'Order moved to packing.'
        : status === 'shipped'
          ? 'Marked shipped. The customer is emailed their tracking.'
          : status === 'out_for_delivery'
            ? 'Marked out for delivery.'
            : 'Delivery confirmed. The customer is emailed.',
    );
    if (ok) setNote('');
    setBusy(false);
  }

  async function resolve(requestId: string, decision: 'approved' | 'rejected', kind: string) {
    setBusy(true);
    const ok = await ui.run(
      async () => {
        const result = await mutate<{ order: OrderDetail }>(
          `/admin/order-requests/${requestId}/resolve`,
          { decision, ...(decisionNote.trim() ? { note: decisionNote.trim() } : {}) },
          csrfToken,
        );
        setOrder(result.order);
      },
      decision === 'approved' ? 'Request approved.' : 'Request declined.',
    );
    setBusy(false);
    if (ok) setDecisionNote('');
    if (ok && decision === 'approved')
      ui.toast(
        kind === 'cancel'
          ? 'Cancellation approved and the recorded refund preference was applied.'
          : 'Return approved and the recorded refund preference was applied.',
      );
  }

  async function issueInvoice() {
    setBusy(true);
    await ui.run(async () => {
      const result = await mutate<{ invoice: { id: string } }>(
        '/billing/invoices',
        { channel: 'online', orderId: order!.id, idempotencyKey: newKey() },
        csrfToken,
      );
      navigate(`/admin/billing/invoices/${result.invoice.id}`);
    }, 'Invoice issued.');
    setBusy(false);
  }

  const terminal = ['cancelled', 'refund_pending', 'refunded'].includes(order.status);
  const reached = (stage: string) => order.timeline.find((event) => event.status === stage);
  const openRequest = order.requests.find((item) => item.status === 'open');
  const address = order.address;
  return (
    <div className="order-detail-page cr-order-detail">
      <Link className="text-link" to="/admin/orders">
        <ArrowLeft size={15} /> All orders
      </Link>
      <div className="section-top order-detail-heading">
        <div>
          <span className="eyebrow red">ORDER DETAIL</span>
          <h2>{order.orderNumber}</h2>
          <p className="muted">
            Placed {dateTime(order.createdAt)} IST · {order.customerName} · {order.customerEmail}
          </p>
        </div>
        <Badge status={order.status} />
      </div>
      <div className="order-detail-layout">
        <section>
          {openRequest && (
            <div className="panel cr-request">
              <h2>
                <MessageSquareWarning size={19} />{' '}
                {openRequest.kind === 'cancel' ? 'CANCELLATION REQUESTED' : 'RETURN REQUESTED'}
              </h2>
              <p>“{openRequest.reason}”</p>
              <p className="muted">
                Refund preference:{' '}
                {openRequest.refundPreference === 'store_credit'
                  ? 'Tiny Kars store credit'
                  : 'original payment method'}
              </p>
              <small className="muted">Asked {dateTime(openRequest.createdAt)} IST</small>
              {manager ? (
                <>
                  <label>
                    Reply to the customer (optional)
                    <input
                      maxLength={1000}
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                    />
                  </label>
                  <div className="cr-editor-actions">
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => void resolve(openRequest.id, 'approved', openRequest.kind)}
                    >
                      <Check size={16} /> Approve
                    </button>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => void resolve(openRequest.id, 'rejected', openRequest.kind)}
                    >
                      <X size={16} /> Decline
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted">An admin will review this request.</p>
              )}
            </div>
          )}
          <div className="panel">
            <h2>
              <Truck size={19} /> THE JOURNEY
            </h2>
            <ol className="order-timeline">
              {stages.map((stage, index) => {
                const event = reached(stage);
                return (
                  <li
                    key={stage}
                    className={`${event ? 'done' : ''} ${order.status === stage ? 'current' : ''}`}
                  >
                    <span>{event ? <Check size={14} /> : index + 1}</span>
                    <div>
                      <b>{statusLabel(stage)}</b>
                      <small>
                        {event ? `${dateTime(event.at)} IST` : terminal ? '—' : 'Coming up'}
                      </small>
                      {event?.note && <small>{event.note}</small>}
                    </div>
                  </li>
                );
              })}
              {order.timeline
                .filter((event) => !stages.includes(event.status as (typeof stages)[number]))
                .filter((event) => event.status !== 'pending_payment')
                .map((event, index) => (
                  <li key={`${event.at}-${index}`} className="done terminal">
                    <span>
                      <MessageSquareWarning size={13} />
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
              <Package size={19} /> THE COLLECTIBLES
            </h2>
            {order.items.map((item) => (
              <div className="cart-line" key={item.sku}>
                <Photo url={item.image} alt={item.name} />
                <div>
                  <b>{item.name}</b>
                  <small>
                    {item.sku} · Qty {item.quantity}
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
            <b>{address.recipientName}</b>
            <p>
              {[address.line1, address.line2].filter(Boolean).join(', ')}
              <br />
              {address.city}, {address.state} {address.postalCode}
              <br />
              {address.phone}
            </p>
            {order.courier && (
              <p>
                <b>{order.courier}</b>
                {order.trackingNumber && ` · ${order.trackingNumber}`}
              </p>
            )}
            {order.deliveryRecipient && <p>Received by {order.deliveryRecipient}</p>}
            {!staff && (
              <>
                <hr />
                <div className="totals">
                  <p>
                    <span>Subtotal</span>
                    <span>{money(order.subtotalPaise)}</span>
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
                  <p>
                    <span>Shipping</span>
                    <span>{order.shippingPaise ? money(order.shippingPaise) : 'FREE'}</span>
                  </p>
                  {order.taxPaise > 0 && (
                    <p>
                      <span>Tax</span>
                      <span>{money(order.taxPaise)}</span>
                    </p>
                  )}
                  <p className="total">
                    <strong>Total paid</strong>
                    <strong>{money(order.totalPaise)}</strong>
                  </p>
                </div>
                {order.invoice ? (
                  <Link className="btn full" to={`/admin/billing/invoices/${order.invoice.id}`}>
                    <ReceiptText size={17} /> View invoice {order.invoice.invoiceNumber}
                  </Link>
                ) : (
                  ['paid', 'processing', 'shipped', 'delivered', 'refunded'].includes(
                    order.status,
                  ) && (
                    <button
                      className="btn full"
                      disabled={busy}
                      onClick={() => void issueInvoice()}
                    >
                      <ReceiptText size={17} /> Issue invoice
                    </button>
                  )
                )}
              </>
            )}
          </div>
          <div className="panel order-actions">
            <h2>{staff ? 'DELIVERY' : 'NEXT STEP'}</h2>
            {order.status === 'paid' && manager && (
              <form onSubmit={(event) => void advance(event, 'processing')}>
                <p className="muted">Payment is confirmed. Start packing when ready.</p>
                <button className="btn btn-primary full" disabled={busy || !!openRequest}>
                  Start packing <ArrowRight size={16} />
                </button>
              </form>
            )}
            {order.status === 'processing' && manager && (
              <form onSubmit={(event) => void advance(event, 'shipped')}>
                <label>
                  Courier
                  <input
                    required
                    maxLength={100}
                    placeholder="e.g. Blue Dart, India Post, hand delivery"
                    value={courier}
                    onChange={(event) => setCourier(event.target.value)}
                  />
                </label>
                <label>
                  Tracking number
                  <input
                    required
                    maxLength={100}
                    value={tracking}
                    onChange={(event) => setTracking(event.target.value)}
                  />
                </label>
                <button className="btn btn-primary full" disabled={busy || !!openRequest}>
                  Mark shipped <ArrowRight size={16} />
                </button>
              </form>
            )}
            {order.status === 'shipped' && (
              <form onSubmit={(event) => void advance(event, 'out_for_delivery')}>
                <p className="muted">The parcel has reached the final delivery run.</p>
                <button className="btn btn-primary full" disabled={busy}>
                  Mark out for delivery <ArrowRight size={16} />
                </button>
              </form>
            )}
            {order.status === 'out_for_delivery' && (
              <form onSubmit={(event) => void advance(event, 'delivered')}>
                <label>
                  Received by
                  <input
                    required
                    maxLength={120}
                    placeholder="Name of the person who took the parcel"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                  />
                </label>
                <label>
                  Delivery note (optional)
                  <input
                    maxLength={500}
                    placeholder="e.g. Left with security, photo taken"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <button className="btn btn-primary full" disabled={busy}>
                  Confirm delivered <Check size={16} />
                </button>
              </form>
            )}
            {openRequest && order.status !== 'shipped' && (
              <p className="muted">Answer the customer’s request before moving this order on.</p>
            )}
            {(order.status === 'delivered' || terminal || order.status === 'pending_payment') && (
              <p className="muted">
                {order.status === 'pending_payment'
                  ? 'Waiting for the customer to complete payment.'
                  : order.status === 'delivered'
                    ? `Delivered${order.deliveredAt ? ` ${dateTime(order.deliveredAt)} IST` : ''}.`
                    : 'This order is closed.'}
              </p>
            )}
            {staff &&
              order.status !== 'shipped' &&
              order.status !== 'out_for_delivery' &&
              order.status !== 'delivered' && (
                <p className="muted">
                  Delivery staff can update the final delivery steps once the order is shipped.
                </p>
              )}
            {manager && order.status !== 'pending_payment' && order.status !== 'refunded' && (
              <Link className="text-link" to={`/admin/finance?order=${order.id}`}>
                Refund this order <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
