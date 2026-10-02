import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  LockKeyhole,
  Check,
  Smartphone,
  CreditCard,
  Wallet,
  AlertCircle,
} from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { cartTotals } from '../services/cart';
import { placeOrder, delivery } from '../services/orders';
import { asset, money } from '../services/format';
import { saveAddress } from '../services/account';
import { useUI, Modal, Empty } from '../components/UI';
import AddressFields, { blankAddress } from '../components/AddressForm';
import { Totals } from '../components/Layout';
import type { Order } from '../types';
export default function Checkout() {
  const state = useStore(),
    ui = useUI(),
    nav = useNavigate(),
    user = state.users.find((u) => u.id === state.userId),
    t = cartTotals(state);
  const [address, setAddress] = useState(
      user?.addresses[0] ?? { ...blankAddress, name: user?.name ?? '', phone: user?.phone ?? '' },
    ),
    [payment, setPayment] = useState<Order['payment']>('UPI'),
    [payOpen, setPayOpen] = useState(false),
    [failure, setFailure] = useState(false),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [pinResult, setPinResult] = useState('');
  function complete() {
    if (busy) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const id = placeOrder(address, payment);
        if (saved) ui.run(() => saveAddress(address));
        setPayOpen(false);
        nav(`/order/${id}?confirmed=1`);
        ui.toast('Your order is placed. Welcome to the garage.');
      } catch (e) {
        ui.toast((e as Error).message, true);
      } finally {
        setBusy(false);
      }
    }, 450);
  }
  if (!user)
    return (
      <div className="container page">
        <Empty title="Your collector account" detail="Sign in with a demo account before checkout.">
          <Link className="btn btn-primary" to="/account?next=checkout">
            Sign in & continue
          </Link>
        </Empty>
      </div>
    );
  if (!t.count)
    return (
      <div className="container page">
        <Empty title="Your garage is empty">
          <Link className="btn btn-primary" to="/shop">
            Find a model
          </Link>
        </Empty>
      </div>
    );
  return (
    <div className="container page">
      <div className="checkout-steps">
        <Link to="/cart">01 Garage</Link>
        <ArrowRight size={15} />
        <b>02 Checkout</b>
        <ArrowRight size={15} />
        <span>03 Yours</span>
      </div>
      <div className="page-heading">
        <span className="eyebrow red">ONE LAST PIT STOP</span>
        <h1>BRING THEM HOME.</h1>
        <p>Securely packed. Collector approved. Ready for your shelf.</p>
      </div>
      <form
        className="cart-layout"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            ui.run(() => {
              const result = delivery(address.pin);
              if (!result.available) throw Error(result.message);
              if (payment === 'COD') complete();
              else {
                setFailure(false);
                setPayOpen(true);
              }
            })
          )
            return;
        }}
      >
        <div className="checkout-main">
          <section className="panel">
            <h2>
              <span>01</span> DELIVERY ADDRESS
            </h2>
            {user.addresses.length > 0 && (
              <div className="saved-address-picker">
                {user.addresses.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className={address.id === a.id ? 'active' : ''}
                    onClick={() => setAddress(a)}
                  >
                    {a.city} · {a.pin} <Check size={14} />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setAddress({ ...blankAddress, name: user.name, phone: user.phone })
                  }
                >
                  + New address
                </button>
              </div>
            )}
            <AddressFields value={address} onChange={setAddress} />
            <div className="pin-action">
              <button
                type="button"
                className="text-link"
                onClick={() => ui.run(() => setPinResult(delivery(address.pin).message))}
              >
                Check PIN-code delivery <ArrowRight size={15} />
              </button>
              {pinResult && <small role="status">{pinResult}</small>}
            </div>
            <label className="check-row">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
              Save this address to my account
            </label>
          </section>
          <section className="panel">
            <h2>
              <span>02</span> PAYMENT METHOD
            </h2>
            <div className="payment-options">
              {(
                [
                  { id: 'UPI', icon: Smartphone, detail: 'Your favourite UPI app' },
                  { id: 'Card', icon: CreditCard, detail: 'Debit or credit card' },
                  { id: 'COD', icon: Wallet, detail: 'Pay on arrival' },
                ] as const
              ).map((p) => (
                <label key={p.id} className={payment === p.id ? 'active' : ''}>
                  <input
                    type="radio"
                    name="payment"
                    value={p.id}
                    checked={payment === p.id}
                    onChange={() => setPayment(p.id)}
                  />
                  <p.icon size={22} />
                  <b>{p.id}</b>
                  <small>{p.detail}</small>
                </label>
              ))}
            </div>
            <div className="notice">
              <LockKeyhole size={17} />
              <span>This is a demo. No bank details are requested and no money is charged.</span>
            </div>
          </section>
        </div>
        <aside className="summary-card">
          <h2>YOUR COLLECTIBLES</h2>
          {t.lines.map((l) => (
            <div key={l.product.id} className="checkout-line">
              <img src={asset(l.product.image)} alt={l.product.name} />
              <span>
                <b>{l.product.name}</b>
                <small>
                  Qty {l.quantity} · {l.product.scale}
                </small>
              </span>
              <strong>{money(l.product.price * l.quantity)}</strong>
            </div>
          ))}
          <Totals />
          <button className="btn btn-primary full" disabled={busy}>
            {busy
              ? 'Placing order…'
              : payment === 'COD'
                ? 'Place demo order'
                : 'Continue to demo payment'}
            <ArrowRight size={18} />
          </button>
          <p className="summary-trust">
            <LockKeyhole size={15} /> Fully simulated checkout
          </p>
        </aside>
      </form>
      {payOpen && (
        <Modal
          title="Demo payment"
          onClose={() => {
            if (!busy) setPayOpen(false);
          }}
        >
          <div className="payment-demo">
            <div className="payment-icon">
              <LockKeyhole size={26} />
            </div>
            <span className="eyebrow red">TINY KARS · SIMULATED PAYMENT</span>
            <h2>{money(t.total)}</h2>
            <p>
              {payment === 'UPI'
                ? 'A real checkout would open your UPI app.'
                : 'A real checkout would open a secure card gateway.'}
            </p>
            <p className="muted">Choose an outcome to demonstrate the payment journey.</p>
            {failure && (
              <div className="notice error" role="alert">
                <AlertCircle size={18} />
                Demo payment failed. Your cart and stock are unchanged. Try again.
              </div>
            )}
            <button className="btn btn-primary full" disabled={busy} onClick={complete}>
              {busy ? 'Processing…' : 'Simulate successful payment'} <Check size={18} />
            </button>
            <button className="btn full" disabled={busy} onClick={() => setFailure(true)}>
              Simulate failed payment
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
