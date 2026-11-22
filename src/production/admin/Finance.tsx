import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Gift, RotateCcw, Wallet } from 'lucide-react';
import { money, mutate, type OrderSummary } from '../api';
import { Badge, Empty, useUI } from '../ui';
import { useResource } from '../useResource';
import { newKey, Notice, PageHeading, rupeesToPaise, useRole } from './shared';

type Customer = { id: string; name: string; email: string };
type Policy = {
  id: string;
  earnPointsPer100Rupees: number;
  redeemPaisePerPoint: number;
  minimumRedeemPoints: number;
  maximumRedeemPoints: number | null;
  active: boolean;
};
type Refund = {
  id: string;
  order_id: string;
  email: string;
  amount_paise: number;
  method: 'store_credit' | 'source';
  status: string;
  reason: string;
};

export function FinancePage() {
  const { superAdmin } = useRole();
  return (
    <>
      <PageHeading title="REWARDS, CREDIT & REFUNDS." />
      <p className="muted">
        Every change is saved as a permanent ledger entry and can be traced later. Card, UPI and
        bank details are never stored here.
      </p>
      {superAdmin ? (
        <>
          <LoyaltyPolicies />
          <Adjustments />
        </>
      ) : (
        <Notice>
          Loyalty rules and manual point or credit adjustments are managed by the super admin.
        </Notice>
      )}
      <Refunds />
    </>
  );
}

function LoyaltyPolicies() {
  const ui = useUI();
  const { csrfToken } = useRole();
  const list = useResource<{ items: Policy[] }>('/admin/loyalty-policies');
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
            '/admin/loyalty-policies',
            {
              earnPointsPer100Rupees: Number(data.get('earn')),
              redeemPaisePerPoint: rupeesToPaise(data.get('value')),
              minimumRedeemPoints: Number(data.get('minimum') || 0),
              maximumRedeemPoints: data.get('maximum') ? Number(data.get('maximum')) : null,
            },
            csrfToken,
          ),
        'Loyalty rule saved as a draft.',
      )
    ) {
      form.reset();
      list.reload();
    }
    setBusy(false);
  }
  async function activate(policy: Policy) {
    if (
      await ui.run(
        () => mutate(`/admin/loyalty-policies/${policy.id}/activate`, {}, csrfToken),
        'Loyalty rule is now active.',
      )
    )
      list.reload();
  }
  const items = list.data?.items || [];
  return (
    <section className="cr-two-col">
      <div className="panel">
        <h2>
          <Gift size={19} /> LOYALTY RULE
        </h2>
        <p className="muted">
          Create a draft, confirm the values with the client, then activate it.
        </p>
        <form onSubmit={create}>
          <div className="form-grid">
            <label>
              Points earned per ₹100
              <input name="earn" type="number" min="0" max="10000" step="1" required />
            </label>
            <label>
              Value of one point (₹)
              <input name="value" type="number" min="0.01" step="0.01" required />
            </label>
            <label>
              Minimum points to redeem
              <input name="minimum" type="number" min="0" step="1" defaultValue="0" />
            </label>
            <label>
              Maximum per order (optional)
              <input name="maximum" type="number" min="1" step="1" />
            </label>
          </div>
          <button className="btn btn-primary" disabled={busy}>
            Save draft <ArrowRight size={16} />
          </button>
        </form>
      </div>
      <div className="panel">
        <h2>SAVED RULES</h2>
        {items.length ? (
          <div className="cr-list">
            {items.map((policy) => (
              <div key={policy.id} className="cr-list-row">
                <span>
                  <b>
                    {policy.earnPointsPer100Rupees} pts / ₹100 · 1 pt ={' '}
                    {money(policy.redeemPaisePerPoint)}
                  </b>
                  <small>
                    Redeem from {policy.minimumRedeemPoints} pts
                    {policy.maximumRedeemPoints
                      ? `, up to ${policy.maximumRedeemPoints} per order`
                      : ''}
                  </small>
                </span>
                {policy.active ? (
                  <Badge status="live" label="Active" />
                ) : (
                  <button className="btn btn-small" onClick={() => void activate(policy)}>
                    Activate
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="No loyalty rule yet"
            detail="Customers earn no points until one is active."
          />
        )}
      </div>
    </section>
  );
}

function Adjustments() {
  const ui = useUI();
  const { csrfToken } = useRole();
  const [params] = useSearchParams();
  const customers = useResource<{ items: Customer[] }>('/admin/finance-customers');
  const [customerId, setCustomerId] = useState(params.get('customer') || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!customerId && customers.data?.items[0]) setCustomerId(customers.data.items[0].id);
  }, [customerId, customers.data]);

  async function adjust(event: FormEvent<HTMLFormElement>, kind: 'loyalty' | 'wallet') {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    if (
      await ui.run(
        () =>
          mutate(
            kind === 'loyalty' ? '/admin/loyalty-adjustments' : '/admin/wallet-adjustments',
            {
              customerId,
              ...(kind === 'loyalty'
                ? { points: Number(data.get('amount')) }
                : { amountPaise: rupeesToPaise(data.get('amount')) }),
              reason: String(data.get('reason') || '').trim(),
              idempotencyKey: newKey(),
            },
            csrfToken,
          ),
        kind === 'loyalty' ? 'Points adjusted.' : 'Store credit adjusted.',
      )
    )
      form.reset();
    setBusy(false);
  }

  return (
    <div className="panel">
      <h2>
        <Wallet size={19} /> ADJUST A COLLECTOR’S POINTS OR STORE CREDIT
      </h2>
      <label>
        Collector
        <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          {customers.data?.items.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} · {customer.email}
            </option>
          ))}
        </select>
      </label>
      {customers.data && !customers.data.items.length && <p className="muted">No customers yet.</p>}
      <div className="cr-two-col">
        <form onSubmit={(event) => void adjust(event, 'loyalty')}>
          <h3>LOYALTY POINTS</h3>
          <label>
            Points (+ to add, − to remove)
            <input name="amount" type="number" step="1" required />
          </label>
          <label>
            Reason
            <input name="reason" required minLength={3} maxLength={500} />
          </label>
          <button className="btn" disabled={busy || !customerId}>
            Save points
          </button>
        </form>
        <form onSubmit={(event) => void adjust(event, 'wallet')}>
          <h3>STORE CREDIT</h3>
          <label>
            Amount in ₹ (+ to add, − to remove)
            <input name="amount" type="number" step="0.01" required />
          </label>
          <label>
            Reason
            <input name="reason" required minLength={3} maxLength={500} />
          </label>
          <button className="btn" disabled={busy || !customerId}>
            Save credit
          </button>
        </form>
      </div>
    </div>
  );
}

function Refunds() {
  const ui = useUI();
  const { csrfToken } = useRole();
  const [params] = useSearchParams();
  const refunds = useResource<{ items: Refund[] }>('/admin/refunds');
  const orders = useResource<{ items: OrderSummary[] }>('/admin/orders');
  const [orderId, setOrderId] = useState(params.get('order') || '');
  const [busy, setBusy] = useState(false);
  const refundable = (orders.data?.items || []).filter(
    (order) => !['pending_payment', 'cancelled', 'refunded'].includes(order.status),
  );
  const selected = refundable.find((order) => order.id === orderId);
  const firstRefundableId = refundable[0]?.id;
  useEffect(() => {
    if (!orderId && firstRefundableId) setOrderId(firstRefundableId);
  }, [firstRefundableId, orderId]);
  const numberOf = (id: string) =>
    orders.data?.items.find((order) => order.id === id)?.orderNumber ||
    id.slice(0, 8).toUpperCase();

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    if (
      await ui.run(
        () =>
          mutate(
            '/admin/refunds',
            {
              orderId,
              amountPaise: rupeesToPaise(data.get('amount')),
              method: String(data.get('method')),
              reason: String(data.get('reason') || '').trim(),
              idempotencyKey: newKey(),
            },
            csrfToken,
          ),
        'Refund recorded.',
      )
    ) {
      form.reset();
      refunds.reload();
      orders.reload();
    }
    setBusy(false);
  }

  async function refresh(refund: Refund) {
    if (
      await ui.run(
        () => mutate(`/admin/refunds/${refund.id}/refresh`, {}, csrfToken),
        'Refund status refreshed from Razorpay.',
      )
    )
      refunds.reload();
  }

  return (
    <>
      <div className="panel">
        <h2>
          <RotateCcw size={19} /> REFUND AN ORDER
        </h2>
        {refundable.length ? (
          <form onSubmit={create}>
            <div className="form-grid">
              <label className="span-2">
                Paid order
                <select value={orderId} onChange={(event) => setOrderId(event.target.value)}>
                  {refundable.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.orderNumber} · {order.customerName} · {money(order.totalPaise)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Refund amount (₹)
                <input
                  key={orderId}
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={selected ? selected.totalPaise / 100 : undefined}
                  defaultValue={selected ? selected.totalPaise / 100 : ''}
                  required
                />
              </label>
              <label>
                Refund to
                <select name="method" defaultValue="store_credit">
                  <option value="store_credit">Store credit (instant)</option>
                  <option value="source">Original payment method (Razorpay)</option>
                </select>
              </label>
              <label className="span-2">
                Reason
                <input name="reason" required minLength={3} maxLength={500} />
              </label>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              Record refund <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <p className="muted">No paid orders can be refunded right now.</p>
        )}
      </div>
      <div className="panel table-panel">
        <h2>REFUND HISTORY</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Collector</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Reason</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {refunds.data?.items.map((refund) => (
                <tr key={refund.id}>
                  <td>{numberOf(refund.order_id)}</td>
                  <td>{refund.email}</td>
                  <td>
                    <b>{money(refund.amount_paise)}</b>
                  </td>
                  <td>{refund.method === 'store_credit' ? 'Store credit' : 'Original method'}</td>
                  <td>
                    <Badge
                      status={
                        refund.status === 'processed'
                          ? 'delivered'
                          : refund.status === 'failed'
                            ? 'failed'
                            : 'pending'
                      }
                      label={refund.status.replaceAll('_', ' ')}
                    />
                  </td>
                  <td>{refund.reason}</td>
                  <td>
                    {refund.method === 'source' && refund.status === 'processing' && (
                      <button className="btn btn-small" onClick={() => void refresh(refund)}>
                        Check status
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {refunds.data && !refunds.data.items.length && <Empty title="No refunds recorded" />}
        {refunds.error && <p className="form-error">{refunds.error.message}</p>}
      </div>
    </>
  );
}
