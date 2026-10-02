import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, MessageCircle } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { cartTotals } from '../services/cart';
import { placeOrder, delivery } from '../services/orders';
import { asset, money } from '../services/format';
import { saveAddress } from '../services/account';
import { getState } from '../services/storage';
import { whatsappOrderLink, normalizeWhatsAppNumber } from '../services/whatsapp';
import { useUI, Empty } from '../components/UI';
import AddressFields, { blankAddress } from '../components/AddressForm';
import { Totals } from '../components/Layout';
export default function Checkout() {
  const state = useStore(),
    ui = useUI(),
    nav = useNavigate(),
    user = state.users.find((u) => u.id === state.userId),
    t = cartTotals(state);
  const [address, setAddress] = useState(
    user?.addresses[0] ?? { ...blankAddress, name: user?.name ?? '', phone: user?.phone ?? '' },
  );
  const [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [pinResult, setPinResult] = useState('');
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
  function complete() {
    if (busy) return;
    setBusy(true);
    try {
      normalizeWhatsAppNumber(state.commerce.whatsappNumber);
      const id = placeOrder(address);
      const order = getState().orders.find((o) => o.id === id)!;
      const link = whatsappOrderLink(state.commerce.whatsappNumber, order);
      if (saved) ui.run(() => saveAddress(address));
      // Keep this synchronous with the click so mobile browsers allow the new tab.
      window.open(link, '_blank', 'noopener,noreferrer');
      nav(`/order/${id}?confirmed=1`);
      ui.toast('Order saved. Tap Send in WhatsApp to request confirmation.');
    } catch (e) {
      ui.toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <div className="checkout-steps">
        <Link to="/cart">01 Garage</Link>
        <ArrowRight size={15} />
        <b>02 Your details</b>
        <ArrowRight size={15} />
        <span>03 WhatsApp</span>
      </div>
      <div className="page-heading">
        <span className="eyebrow red">ONE LAST PIT STOP</span>
        <h1>BRING THEM HOME.</h1>
        <p>
          Send your selection to Tiny Kars. Confirm availability and payment with us on WhatsApp.
        </p>
      </div>
      <form
        className="cart-layout"
        onSubmit={(e) => {
          e.preventDefault();
          complete();
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
          <section className="panel whatsapp-panel">
            <h2>
              <MessageCircle size={22} /> ORDER ON WHATSAPP
            </h2>
            <p>
              We’ll prepare a message with your models, quantities, total and delivery address.
              Review it and tap Send in WhatsApp.
            </p>
            <p className="muted">
              Tiny Kars will confirm your order and share payment instructions in the chat.
            </p>
            <div className="notice">
              <MessageCircle size={18} />
              <span>
                No online payment is taken. Demo orders and stock are saved only in this browser.
              </span>
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
          <button className="btn btn-whatsapp full" disabled={busy}>
            {busy ? 'Preparing order…' : 'Order on WhatsApp'}
            <MessageCircle size={18} />
          </button>
          <p className="summary-trust">Review and send your order in WhatsApp</p>
        </aside>
      </form>
    </div>
  );
}
