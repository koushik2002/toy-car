import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, LockKeyhole, MessageCircle, ShieldCheck, Tag, X } from 'lucide-react';
import { ApiError, money, mutate, request, type Address, type CheckoutQuote } from './api';
import { useSession } from './session';
import { useCart } from './cart';
import { Empty, PageLoading, Photo, useUI } from './ui';

type Finance = {
  loyaltyPoints: number;
  walletPaise: number;
  loyaltyPolicy: {
    redeemPaisePerPoint: number;
    minimumRedeemPoints: number;
    maximumRedeemPoints: number | null;
  } | null;
};
type CheckoutResult = {
  orderId: string;
  providerOrderId: string | null;
  keyId: string | null;
  paymentMode: 'test' | 'razorpay';
  currency: 'INR';
  amountPaise: number;
};
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  notes: { local_order_id: string };
  handler: () => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

let razorpayScript: Promise<void> | undefined;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScript)
    razorpayScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        razorpayScript = undefined;
        reject(
          new Error('Secure payment could not be loaded. Check your connection and try again.'),
        );
      };
      document.head.append(script);
    });
  return razorpayScript;
}

const blank = {
  recipientName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
};
type AddressFields = typeof blank;
const voucherCodes = ['VOUCHER_UNAVAILABLE', 'VOUCHER_USED', 'MINIMUM_NOT_MET'];
const cleanPhone = (value: string) => value.replace(/[\s()-]/g, '');

export function CheckoutPage() {
  const { user, csrfToken, config } = useSession();
  const cart = useCart();
  const ui = useUI();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialVoucher = /^[A-Z0-9-]{4,32}$/.test((searchParams.get('voucher') || '').toUpperCase())
    ? (searchParams.get('voucher') || '').toUpperCase()
    : '';
  const checkoutKey = useRef(crypto.randomUUID());
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selected, setSelected] = useState<string>('new');
  const [address, setAddress] = useState<AddressFields>({
    ...blank,
    recipientName: user?.name || '',
  });
  const [saveAddress, setSaveAddress] = useState(false);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [voucherInput, setVoucherInput] = useState(initialVoucher);
  const [voucher, setVoucher] = useState(initialVoucher);
  const [voucherError, setVoucherError] = useState('');
  const [walletRupees, setWalletRupees] = useState('');
  const [points, setPoints] = useState('');
  const [whatsapp, setWhatsapp] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState('');
  const customer = user?.role === 'customer';

  useEffect(() => {
    if (!customer) return;
    void request<{ items: Address[] }>('/account/addresses').then(
      (result) => {
        setAddresses(result.items);
        const preferred = result.items.find((item) => item.isDefault) || result.items[0];
        if (preferred) choose(preferred);
      },
      () => setAddresses([]),
    );
    void request<Finance>('/finance').then(setFinance, () => setFinance(null));
  }, [customer]);

  function choose(item: Address) {
    setSelected(item.id);
    setAddress({
      recipientName: item.recipientName,
      phone: item.phone,
      line1: item.line1,
      line2: item.line2,
      city: item.city,
      state: item.state,
      postalCode: item.postalCode,
    });
    setSaveAddress(false);
  }

  const items = cart.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity }));
  const itemsKey = JSON.stringify(items);
  const walletPaise = Math.max(0, Math.round(Number(walletRupees || 0) * 100));
  const redeemPoints = Math.max(0, Math.floor(Number(points || 0)));
  const pinReady = /^[1-9][0-9]{5}$/.test(address.postalCode);

  useEffect(() => {
    if (!customer || !items.length) return;
    const timer = setTimeout(() => {
      setQuoting(true);
      void mutate<CheckoutQuote>(
        '/checkout/quote',
        {
          items,
          ...(pinReady ? { postalCode: address.postalCode } : {}),
          ...(voucher ? { voucherCode: voucher } : {}),
          ...(walletPaise ? { walletPaise } : {}),
          ...(redeemPoints ? { redeemPoints } : {}),
        },
        csrfToken,
      )
        .then(
          (value) => {
            setQuote(value);
            setQuoteError('');
          },
          (error: Error) => {
            if (error instanceof ApiError && voucherCodes.includes(error.code)) {
              setVoucherError(error.message);
              setVoucher('');
              return;
            }
            setQuote(null);
            setQuoteError(
              error instanceof ApiError && error.code === 'POSTAL_CODE_REQUIRED'
                ? 'Enter your six-digit PIN code to see the delivery charge.'
                : error.message,
            );
          },
        )
        .finally(() => setQuoting(false));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    customer,
    itemsKey,
    pinReady,
    address.postalCode,
    voucher,
    walletPaise,
    redeemPoints,
    csrfToken,
  ]);

  if (!user) return <PageLoading label="Preparing secure checkout…" />;
  if (!customer)
    return (
      <div className="container page">
        <Empty
          title="Customer checkout"
          detail="Team accounts cannot place customer orders. Sign in with a customer account to buy."
        >
          <Link className="btn btn-primary" to="/">
            Back to the garage
          </Link>
        </Empty>
      </div>
    );
  if (!cart.count)
    return (
      <div className="container page">
        <Empty title="Your garage is empty" detail="Add a model before heading to checkout.">
          <Link className="btn btn-primary" to="/shop">
            Find a model
          </Link>
        </Empty>
      </div>
    );

  const set = (key: keyof AddressFields, value: string) => {
    setAddress((current) => ({ ...current, [key]: value }));
    if (selected !== 'new') setSelected('new');
  };
  const checkoutEnabled = !!config?.commerce.checkoutEnabled;
  const testPayment = config?.commerce.paymentMode === 'test';
  const policy = finance?.loyaltyPolicy;
  const maxPoints = Math.min(
    finance?.loyaltyPoints || 0,
    policy?.maximumRedeemPoints ?? Number.MAX_SAFE_INTEGER,
  );

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure('');
    setStatus('Confirming stock, discount and delivery…');
    const payload = {
      recipientName: address.recipientName.trim(),
      phone: cleanPhone(address.phone),
      line1: address.line1.trim(),
      line2: address.line2.trim(),
      city: address.city.trim(),
      state: address.state.trim(),
      postalCode: address.postalCode.trim(),
    };
    try {
      if (saveAddress && selected === 'new')
        await mutate('/account/addresses', payload, csrfToken).then(
          () => ui.toast('Address saved to your account.'),
          (error: Error) => ui.toast(`Address not saved: ${error.message}`, true),
        );
      const result = await mutate<CheckoutResult>(
        '/checkout/orders',
        {
          checkoutKey: checkoutKey.current,
          items,
          address: payload,
          ...(voucher ? { voucherCode: voucher } : {}),
          walletPaise,
          redeemPoints,
          whatsappOptIn: whatsapp,
        },
        csrfToken,
      );
      if (result.paymentMode === 'test') {
        setStatus('Running the local test payment…');
        await mutate(`/test-payments/${result.orderId}/success`, {}, csrfToken);
        setStatus('Local test payment confirmed. Opening your order…');
        cart.clear();
        navigate(`/account/orders/${result.orderId}?payment=confirmed`);
        return;
      }
      if (!result.providerOrderId || !result.keyId)
        throw new Error('The payment provider returned an incomplete checkout. Try again.');
      setStatus(`Total ${money(result.amountPaise)}. Opening secure payment…`);
      await loadRazorpay();
      if (!window.Razorpay) throw new Error('Secure payment could not be loaded. Try again.');
      new window.Razorpay({
        key: result.keyId,
        amount: result.amountPaise,
        currency: result.currency,
        name: 'Tiny Kars',
        description: `${cart.count} ${cart.count === 1 ? 'collectible' : 'collectibles'}`,
        order_id: result.providerOrderId,
        prefill: { name: payload.recipientName, email: user!.email, contact: payload.phone },
        notes: { local_order_id: result.orderId },
        handler: () => {
          cart.clear();
          navigate(`/account/orders/${result.orderId}?payment=submitted`);
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setStatus(
              'Payment was not completed. Your reserved stock is released after 15 minutes.',
            );
          },
        },
        theme: { color: '#ef3340' },
      }).open();
    } catch (error) {
      setFailure((error as Error).message);
      setStatus('');
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <div className="checkout-steps" aria-label="Checkout progress">
        <Link to="/cart">01 Garage</Link>
        <ArrowRight size={15} />
        <b aria-current="step">02 Your details</b>
        <ArrowRight size={15} />
        <span>03 Payment</span>
      </div>
      <div className="page-heading">
        <span className="eyebrow red">ONE LAST PIT STOP</span>
        <h1>BRING THEM HOME.</h1>
        <p>
          Check your delivery details and the full amount.{' '}
          {testPayment
            ? 'This local review uses the safe test-payment adapter.'
            : "You pay on Razorpay's secure page."}
        </p>
      </div>
      <form className="cart-layout" onSubmit={pay}>
        <div className="checkout-main">
          <section className="panel">
            <h2>
              <span>01</span> DELIVERY ADDRESS
            </h2>
            {!!addresses?.length && (
              <div className="saved-address-picker" role="group" aria-label="Saved addresses">
                {addresses.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={selected === item.id ? 'active' : ''}
                    aria-pressed={selected === item.id}
                    onClick={() => choose(item)}
                  >
                    {item.city} · {item.postalCode} {selected === item.id && <Check size={14} />}
                  </button>
                ))}
                <button
                  type="button"
                  className={selected === 'new' ? 'active' : ''}
                  aria-pressed={selected === 'new'}
                  onClick={() => {
                    setSelected('new');
                    setAddress({ ...blank, recipientName: user.name });
                  }}
                >
                  + New address
                </button>
              </div>
            )}
            <div className="form-grid">
              <label>
                Full name
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={address.recipientName}
                  onChange={(event) => set('recipientName', event.target.value)}
                />
              </label>
              <label>
                Mobile number
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                  pattern={'\\+?[1-9][0-9]{7,14}'}
                  placeholder="10-digit mobile number"
                  value={address.phone}
                  onChange={(event) => set('phone', event.target.value)}
                />
              </label>
              <label className="span-2">
                House number and street
                <input
                  autoComplete="address-line1"
                  required
                  minLength={3}
                  maxLength={200}
                  value={address.line1}
                  onChange={(event) => set('line1', event.target.value)}
                />
              </label>
              <label className="span-2">
                Apartment, landmark (optional)
                <input
                  autoComplete="address-line2"
                  maxLength={200}
                  value={address.line2}
                  onChange={(event) => set('line2', event.target.value)}
                />
              </label>
              <label>
                City
                <input
                  autoComplete="address-level2"
                  required
                  minLength={2}
                  value={address.city}
                  onChange={(event) => set('city', event.target.value)}
                />
              </label>
              <label>
                State
                <input
                  autoComplete="address-level1"
                  required
                  minLength={2}
                  value={address.state}
                  onChange={(event) => set('state', event.target.value)}
                />
              </label>
              <label>
                PIN code
                <input
                  autoComplete="postal-code"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  pattern="[1-9][0-9]{5}"
                  title="Six-digit Indian PIN code"
                  placeholder="6-digit PIN"
                  value={address.postalCode}
                  onChange={(event) => set('postalCode', event.target.value.replace(/\D/g, ''))}
                />
              </label>
            </div>
            {selected === 'new' && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={(event) => setSaveAddress(event.target.checked)}
                />
                Save this address to my account
              </label>
            )}
          </section>
          <section className="panel">
            <h2>
              <span>02</span> SAVINGS & REWARDS
            </h2>
            <div className="coupon">
              <div className="coupon-form">
                <input
                  aria-label="Voucher code"
                  placeholder="Got a voucher code?"
                  autoCapitalize="characters"
                  maxLength={32}
                  value={voucherInput}
                  onChange={(event) => setVoucherInput(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      setVoucherError('');
                      setVoucher(voucherInput.trim());
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!voucherInput.trim()}
                  onClick={() => {
                    setVoucherError('');
                    setVoucher(voucherInput.trim());
                  }}
                >
                  Apply
                </button>
              </div>
              {voucher && quote && !voucherError && (
                <button
                  type="button"
                  className="coupon-chip"
                  onClick={() => {
                    setVoucher('');
                    setVoucherInput('');
                  }}
                >
                  <Tag size={13} /> {voucher} <X size={13} /> Remove
                </button>
              )}
              {voucherError && (
                <small className="form-error" role="alert">
                  {voucherError}
                </small>
              )}
            </div>
            <div className="form-grid">
              <label>
                Use store credit (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={(finance?.walletPaise || 0) / 100}
                  disabled={!finance?.walletPaise}
                  value={walletRupees}
                  placeholder="0"
                  onChange={(event) => setWalletRupees(event.target.value)}
                />
                <small>Available: {money(finance?.walletPaise || 0)}</small>
              </label>
              <label>
                Redeem loyalty points
                <input
                  type="number"
                  min="0"
                  step="1"
                  max={maxPoints}
                  disabled={!policy || !finance?.loyaltyPoints}
                  value={points}
                  placeholder="0"
                  onChange={(event) => setPoints(event.target.value)}
                />
                <small>
                  {policy
                    ? `${finance?.loyaltyPoints || 0} points · ${money(policy.redeemPaisePerPoint)} each · from ${policy.minimumRedeemPoints} points`
                    : 'Points redemption is not active yet'}
                </small>
              </label>
            </div>
          </section>
          <section className="panel whatsapp-panel">
            <h2>
              <MessageCircle size={22} /> ORDER UPDATES
            </h2>
            <p>We email your confirmation, dispatch and delivery updates.</p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={whatsapp}
                onChange={(event) => setWhatsapp(event.target.checked)}
              />
              Also send my order confirmation on WhatsApp to the mobile number above
            </label>
          </section>
        </div>
        <aside className="summary-card">
          <h2>YOUR COLLECTIBLES</h2>
          {cart.lines.map((line) => (
            <div key={line.product.id} className="checkout-line">
              <Photo url={line.product.images[0]?.url} alt={line.product.name} />
              <span>
                <b>{line.product.name}</b>
                <small>
                  Qty {line.quantity} · {line.product.scale}
                </small>
              </span>
              <strong>{money(line.product.pricePaise * line.quantity)}</strong>
            </div>
          ))}
          <div className="totals" aria-live="polite" aria-busy={quoting}>
            <p>
              <span>Subtotal</span>
              <span>{money(quote?.subtotalPaise ?? cart.subtotalPaise)}</span>
            </p>
            <p>
              <span>
                Delivery
                {quote?.shippingZone && <small>{quote.shippingZone}</small>}
              </span>
              <span>
                {quote && (pinReady || quote.freeShippingApplied)
                  ? quote.shippingPaise
                    ? money(quote.shippingPaise)
                    : 'FREE'
                  : 'Enter PIN code'}
              </span>
            </p>
            {!!quote?.voucherDiscountPaise && (
              <p className="saving">
                <span>Voucher {voucher}</span>
                <span>−{money(quote.voucherDiscountPaise)}</span>
              </p>
            )}
            {!!quote?.walletAppliedPaise && (
              <p className="saving">
                <span>Store credit</span>
                <span>−{money(quote.walletAppliedPaise)}</span>
              </p>
            )}
            {!!quote?.loyaltyAppliedPaise && (
              <p className="saving">
                <span>Loyalty points</span>
                <span>−{money(quote.loyaltyAppliedPaise)}</span>
              </p>
            )}
            <p className="total">
              <strong>Total to pay</strong>
              <strong>{quote && pinReady ? money(quote.totalPaise) : '—'}</strong>
            </p>
            {quoting && <small className="muted">Updating your total…</small>}
            {quoteError && (
              <small className="form-error" role="alert">
                {quoteError}
              </small>
            )}
          </div>
          {checkoutEnabled ? (
            <>
              {failure && (
                <p className="form-error" role="alert">
                  {failure}
                </p>
              )}
              {status && (
                <p className="muted" role="status">
                  {status}
                </p>
              )}
              <button
                className="btn btn-primary full"
                disabled={busy || !quote || !pinReady || !!quoteError}
              >
                <LockKeyhole size={18} />
                {busy
                  ? testPayment
                    ? 'Placing test order…'
                    : 'Preparing payment…'
                  : quote && pinReady
                    ? testPayment
                      ? `Place test order · ${money(quote.totalPaise)}`
                      : `Pay ${money(quote.totalPaise)} securely`
                    : testPayment
                      ? 'Place test order'
                      : 'Pay securely'}
              </button>
              <p className="summary-trust">
                <ShieldCheck size={15} />{' '}
                {testPayment
                  ? 'Test mode records a real local order without charging money or contacting a payment provider.'
                  : 'Payment happens on Razorpay. Tiny Kars never sees your card number, CVV or UPI PIN.'}
              </p>
            </>
          ) : (
            <div className="notice payment-soon" role="status">
              <ShieldCheck size={18} />
              <span>
                <b>Online payment opens soon.</b> The shop is completing its payment account
                verification. Your garage is saved — come back to pay once it opens.
              </span>
            </div>
          )}
        </aside>
      </form>
    </div>
  );
}
