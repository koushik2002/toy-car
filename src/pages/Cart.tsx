import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X, Tag, ChevronRight, ShieldCheck } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { cartTotals, setQuantity, applyCoupon } from '../services/cart';
import { asset, money } from '../services/format';
import { transact } from '../services/storage';
import { Quantity, Empty, useUI } from '../components/UI';
import { Totals, ShippingProgress } from '../components/Layout';
export default function Cart() {
  const state = useStore(),
    ui = useUI(),
    t = cartTotals(state),
    [code, setCode] = useState('');
  return (
    <div className="container page">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight size={13} />
        Your garage
      </div>
      <div className="page-heading">
        <span className="eyebrow red">SHELF SPACE WELL SPENT</span>
        <h1>
          YOUR GARAGE<span className="title-count">{t.count}</span>
        </h1>
        <p>Great picks. Let's get them home.</p>
      </div>
      {t.count ? (
        <div className="cart-layout">
          <div>
            <ShippingProgress value={t.subtotal - t.discount} />
            {t.lines.map((l) => (
              <article className="cart-line cart-page-line" key={l.product.id}>
                <Link to={`/product/${l.product.id}`}>
                  <img src={asset(l.product.image)} alt={l.product.name} />
                </Link>
                <div>
                  <small>
                    {l.product.brand} · {l.product.scale} · {l.product.condition}
                  </small>
                  <Link to={`/product/${l.product.id}`}>{l.product.name}</Link>
                  <span className="muted">{l.product.series}</span>
                  {l.product.offer === 'bundle' && (
                    <span className="saving">Eligible for any 3 for ₹550</span>
                  )}
                  <Quantity
                    value={l.quantity}
                    max={l.product.stock}
                    onChange={(q) => ui.run(() => setQuantity(l.product.id, q))}
                  />
                </div>
                <div className="line-price">
                  <strong>{money(l.product.price * l.quantity)}</strong>
                  <small>{money(l.product.price)} each</small>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${l.product.name}`}
                    onClick={() => ui.run(() => setQuantity(l.product.id, 0))}
                  >
                    <X size={18} />
                  </button>
                </div>
              </article>
            ))}
            <Link className="text-link" to="/shop">
              Keep the hunt going <ArrowRight size={16} />
            </Link>
            <div className="notice">
              <Tag size={20} />
              <span>
                Starter Garage discounts apply automatically to every 3 eligible models. Collector
                Buy 2 Get 1 applies to marked models, with the cheapest in each set free. Coupons
                apply after bundle savings.
              </span>
            </div>
          </div>
          <aside className="summary-card">
            <h2>THE FINAL LAP</h2>
            <Coupon code={code} setCode={setCode} />
            <Totals />
            <Link className="btn btn-primary full" to="/checkout">
              Head to checkout <ArrowRight size={18} />
            </Link>
            <p className="summary-trust">
              <ShieldCheck size={15} /> Demo checkout · no real payment
            </p>
          </aside>
        </div>
      ) : (
        <Empty
          title="Your garage is waiting"
          detail="Start with one car. Who knows where it'll lead?"
        >
          <Link to="/shop" className="btn btn-primary">
            Explore the collection <ArrowRight size={17} />
          </Link>
        </Empty>
      )}
    </div>
  );
}
export function Coupon({ code, setCode }: { code: string; setCode: (v: string) => void }) {
  const state = useStore(),
    ui = useUI();
  return (
    <div className="coupon">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ui.run(() => applyCoupon(code), 'Coupon applied. Nice find!');
        }}
      >
        <input
          aria-label="Coupon code"
          placeholder="Got a code? Try TINY10"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="btn btn-small">Apply</button>
      </form>
      {state.coupon && (
        <button
          className="coupon-chip"
          onClick={() =>
            transact((d) => {
              d.coupon = '';
            })
          }
        >
          {state.coupon} <X size={13} /> Remove
        </button>
      )}
      <small>TINY10: 10% off orders above ₹499.</small>
    </div>
  );
}
