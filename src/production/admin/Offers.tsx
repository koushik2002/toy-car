import { useState, type FormEvent } from 'react';
import { ArrowRight, Info, Plus, Tag, Truck } from 'lucide-react';
import { date, money, mutate } from '../api';
import { Badge, Empty, Modal, useUI } from '../ui';
import { useResource } from '../useResource';
import { Notice, PageHeading, rupeesToPaise, useRole } from './shared';

type Voucher = {
  id: string;
  code: string;
  kind: 'fixed' | 'percent';
  value: number;
  minimumSubtotalPaise: number;
  maxDiscountPaise: number | null;
  useScope: 'global_once' | 'once_per_customer';
  expiresAt: string;
  active: boolean;
};
type ShippingPolicy = {
  id: string;
  mode: 'flat' | 'postcode';
  basePaise: number;
  freeAbovePaise: number | null;
  postcodeRates: { prefix: string; amountPaise: number; name?: string }[];
  active: boolean;
  createdAt: string;
};

const discountText = (voucher: Voucher) =>
  voucher.kind === 'fixed'
    ? `${money(voucher.value)} off`
    : `${voucher.value / 100}% off${voucher.maxDiscountPaise ? ` (up to ${money(voucher.maxDiscountPaise)})` : ''}`;

export function OffersPage() {
  const { superAdmin } = useRole();
  return (
    <>
      <PageHeading title="A LITTLE EXTRA JOY." />
      <div className="panel cr-info">
        <Info size={20} />
        <div>
          <h2>AUTOMATIC BUNDLE OFFERS</h2>
          <p>
            The demo showed “Any 3 for ₹550” and “Buy 2, get 1 free”. These are waiting for the
            client to confirm the exact rules (which models, how they combine with vouchers, points
            and refunds). Until then, products can carry an offer label, but no automatic discount
            is applied at checkout.
          </p>
        </div>
      </div>
      {superAdmin ? (
        <>
          <Vouchers />
          <Shipping />
        </>
      ) : (
        <Notice>
          Vouchers and shipping charges are managed by the super admin. Ask them to change a code or
          a delivery charge.
        </Notice>
      )}
    </>
  );
}

function Vouchers() {
  const ui = useUI();
  const { csrfToken } = useRole();
  const list = useResource<{ items: Voucher[] }>('/admin/vouchers');
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<'fixed' | 'percent'>('fixed');
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = Number(data.get('value'));
    const cap = String(data.get('cap') || '').trim();
    const expires = String(data.get('expires') || '');
    if (!Number.isFinite(value) || value <= 0) {
      ui.toast('Enter a valid discount.', true);
      return;
    }
    setBusy(true);
    if (
      await ui.run(
        () =>
          mutate(
            '/admin/vouchers',
            {
              ...(data.get('code') ? { code: String(data.get('code')).trim().toUpperCase() } : {}),
              kind,
              value: Math.round(value * 100),
              minimumSubtotalPaise: rupeesToPaise(data.get('minimum')),
              maxDiscountPaise: kind === 'percent' && cap ? rupeesToPaise(cap) : null,
              useScope: String(data.get('scope')),
              expiresAt: new Date(`${expires}T23:59:59+05:30`).toISOString(),
            },
            csrfToken,
          ),
        'Voucher saved. Customers can use it at checkout.',
      )
    ) {
      setCreating(false);
      setKind('fixed');
      list.reload();
    }
    setBusy(false);
  }

  async function disable(voucher: Voucher) {
    if (
      await ui.run(
        () => mutate(`/admin/vouchers/${voucher.id}/disable`, {}, csrfToken),
        `${voucher.code} disabled.`,
      )
    )
      list.reload();
  }

  const items = list.data?.items || [];
  return (
    <>
      <div className="section-top">
        <h2>DISCOUNT VOUCHERS</h2>
        <button className="btn btn-primary btn-small" onClick={() => setCreating(true)}>
          <Plus size={16} /> New voucher
        </button>
      </div>
      <p className="muted">
        One-time codes: “once in total” means the first customer to use it uses it up; “once per
        customer” lets every customer use it once.
      </p>
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Minimum order</th>
                <th>One-use rule</th>
                <th>Expires</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((voucher) => {
                const expired = new Date(voucher.expiresAt) < new Date();
                return (
                  <tr key={voucher.id}>
                    <td>
                      <b className="coupon-code">{voucher.code}</b>
                    </td>
                    <td>{discountText(voucher)}</td>
                    <td>{money(voucher.minimumSubtotalPaise)}</td>
                    <td>
                      {voucher.useScope === 'global_once' ? 'Once in total' : 'Once per customer'}
                    </td>
                    <td>{date(voucher.expiresAt)}</td>
                    <td>
                      <Badge
                        status={voucher.active && !expired ? 'live' : 'cancelled'}
                        label={!voucher.active ? 'Disabled' : expired ? 'Expired' : 'Active'}
                      />
                    </td>
                    <td>
                      {voucher.active && (
                        <button className="btn btn-small" onClick={() => void disable(voucher)}>
                          Disable
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.error && <p className="form-error">{list.error.message}</p>}
        {list.data && !items.length && <Empty title="No vouchers yet" />}
      </div>
      {creating && (
        <Modal title="Create a voucher" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <label>
              Code (leave empty to generate one)
              <input
                name="code"
                maxLength={32}
                pattern="[A-Za-z0-9-]{4,32}"
                autoCapitalize="characters"
              />
            </label>
            <label>
              Discount type
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as 'fixed' | 'percent')}
              >
                <option value="fixed">Fixed rupee amount</option>
                <option value="percent">Percentage</option>
              </select>
            </label>
            <label>
              {kind === 'fixed' ? 'Discount (₹)' : 'Discount (%)'}
              <input
                name="value"
                type="number"
                min="0.01"
                max={kind === 'percent' ? 100 : undefined}
                step="0.01"
                required
              />
            </label>
            {kind === 'percent' && (
              <label>
                Maximum discount (₹, optional)
                <input name="cap" type="number" min="1" step="0.01" />
              </label>
            )}
            <label>
              Minimum order value (₹)
              <input name="minimum" type="number" min="0" step="0.01" defaultValue="0" />
            </label>
            <label>
              One-use rule
              <select name="scope" defaultValue="global_once">
                <option value="global_once">Once in total</option>
                <option value="once_per_customer">Once per customer</option>
              </select>
            </label>
            <label>
              Last valid day
              <input
                name="expires"
                type="date"
                required
                min={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <button className="btn btn-primary full" disabled={busy}>
              Save voucher <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function Shipping() {
  const ui = useUI();
  const { csrfToken } = useRole();
  const list = useResource<{ items: ShippingPolicy[] }>('/admin/shipping-policies');
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'flat' | 'postcode'>('flat');
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    const ok = await ui.run(async () => {
      const free = String(data.get('free') || '').trim();
      const postcodeRates =
        mode === 'postcode'
          ? String(data.get('rates') || '')
              .trim()
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line) => {
                const [prefix, amount, name, extra] = line.split(',').map((value) => value.trim());
                if (extra || !/^[1-9][0-9]{0,5}$/.test(prefix) || !/^\d+(\.\d{1,2})?$/.test(amount))
                  throw new Error(
                    'Each zone needs a PIN prefix, rupee amount and optional name, such as 560,49,Bengaluru.',
                  );
                return { prefix, amountPaise: rupeesToPaise(amount), ...(name ? { name } : {}) };
              })
          : [];
      await mutate(
        '/admin/shipping-policies',
        {
          mode,
          basePaise: rupeesToPaise(data.get('base')),
          freeAbovePaise: free ? rupeesToPaise(free) : null,
          postcodeRates,
        },
        csrfToken,
      );
    }, 'Draft saved. Activate it when the client confirms the rule.');
    if (ok) {
      setCreating(false);
      setMode('flat');
      list.reload();
    }
    setBusy(false);
  }

  async function activate(policy: ShippingPolicy) {
    if (
      await ui.run(
        () => mutate(`/admin/shipping-policies/${policy.id}/activate`, {}, csrfToken),
        'This shipping rule is now used at checkout.',
      )
    )
      list.reload();
  }

  const items = list.data?.items || [];
  return (
    <>
      <div className="section-top">
        <h2>SHIPPING CHARGES</h2>
        <button className="btn btn-small" onClick={() => setCreating(true)}>
          <Plus size={15} /> New rule
        </button>
      </div>
      <div className="offers-grid">
        {items.map((policy) => (
          <div className="panel offer-card" key={policy.id}>
            {policy.mode === 'flat' ? <Truck size={23} /> : <Tag size={23} />}
            <h2>{policy.mode === 'flat' ? 'SAME CHARGE EVERYWHERE' : 'BY PIN CODE'}</h2>
            <p>
              {money(policy.basePaise)}{' '}
              {policy.mode === 'postcode' ? 'default charge' : 'per order'}
              {policy.freeAbovePaise !== null && ` · free from ${money(policy.freeAbovePaise)}`}
            </p>
            {policy.postcodeRates.length > 0 && (
              <p className="muted">
                {policy.postcodeRates
                  .map(
                    (rate) =>
                      `${rate.name ? `${rate.name} · ` : ''}${rate.prefix}… ${money(rate.amountPaise)}`,
                  )
                  .join(' · ')}
              </p>
            )}
            <div className="toggle-row">
              <Badge
                status={policy.active ? 'live' : 'draft'}
                label={policy.active ? 'Active' : 'Draft'}
              />
              {!policy.active && (
                <button className="btn btn-small" onClick={() => void activate(policy)}>
                  Activate
                </button>
              )}
            </div>
            <small className="muted">Created {date(policy.createdAt)}</small>
          </div>
        ))}
      </div>
      {list.error && <p className="form-error">{list.error.message}</p>}
      {list.data && !items.length && (
        <Empty title="No shipping rule yet" detail="Checkout stays closed until one is active." />
      )}
      {creating && (
        <Modal title="New shipping rule" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <label>
              How is shipping charged?
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as 'flat' | 'postcode')}
              >
                <option value="flat">Same charge for all PIN codes</option>
                <option value="postcode">Different charge by PIN-code prefix</option>
              </select>
            </label>
            <label>
              {mode === 'flat' ? 'Shipping charge (₹)' : 'Default charge (₹)'}
              <input name="base" type="number" min="0" step="0.01" required />
            </label>
            <label>
              Free shipping from order value (₹, optional)
              <input name="free" type="number" min="0" step="0.01" />
            </label>
            {mode === 'postcode' && (
              <label>
                Shipping zones, one per line
                <textarea name="rates" required placeholder={'560,49,Bengaluru\n110,99,Delhi'} />
                <small>
                  PIN prefix, rupees, optional zone name. The longest matching prefix wins.
                </small>
              </label>
            )}
            <button className="btn btn-primary full" disabled={busy}>
              Save draft <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
