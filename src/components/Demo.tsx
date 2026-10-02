import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  Play,
  X,
  ArrowRight,
  RotateCcw,
  ShoppingBag,
  Boxes,
  Plug,
  ChevronLeft,
  Check,
} from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { transact, resetDemo, getState } from '../services/storage';
import { addToCart } from '../services/cart';
import { placeOrder, advanceOrder } from '../services/orders';
import { simulateOrder, simulateLowStock, simulateSyncFailure } from '../services/demo';
import { setOffline, retryAll, pullStock } from '../services/tallySync';
import { login } from '../services/account';
import { Modal, useUI } from './UI';
const tour = [
  [
    'Welcome to Tiny Kars',
    'Browse the collector storefront. Start with a fresh drop or explore the full catalogue.',
    '/',
    '[data-tour="hero"]',
  ],
  [
    'Find your next collectible',
    'Use the catalogue filters. The Starter Garage models qualify for any 3 for ₹550.',
    '/shop?offer=bundle',
    '[data-tour="browse"]',
  ],
  [
    'Build a bundle',
    'Add three of the red Skyline models to see the automatic bundle offer.',
    '/shop?offer=bundle',
    '[data-tour="browse"]',
  ],
  [
    'See your savings',
    'The cart explains the bundle discount and free shipping threshold. Try TINY10.',
    '/cart',
    '.summary-card',
  ],
  [
    'Bring the models home',
    'Complete the demo checkout, or use “Place tour order” with Vishwas’s saved address.',
    '/checkout',
    '.checkout-main',
  ],
  [
    'Your order, your timeline',
    'View your new order. Stock is decremented and Tally jobs have been created.',
    '/account',
    '.account-content',
  ],
  [
    'Behind the garage doors',
    'The same order is now visible to the admin. Advance its status to Confirmed.',
    '/admin/orders',
    '.admin-content',
  ],
  [
    'Updates reach the collector',
    'Return to the collector timeline to see the confirmed status immediately.',
    '/account',
    '.account-content',
  ],
  [
    'Meet the Tally bridge',
    'Sales vouchers and stock adjustments move through pending → success or failed.',
    '/admin/tally',
    '[data-tour="tally"]',
  ],
  [
    'A failure worth demonstrating',
    'Create a deliberate failed sync. You can also set the bridge offline.',
    '/admin/tally',
    '.admin-content',
  ],
  [
    'Recover with a retry',
    'Bring Tally online and retry failed jobs. Backoff timers are visible in the log.',
    '/admin/tally',
    '.admin-content',
  ],
  [
    'Keep stock in agreement',
    'Pull a simulated Tally snapshot, open Reconciliation, and accept either source.',
    '/admin/tally',
    '.admin-content',
  ],
];
export default function Demo() {
  const s = useStore(),
    ui = useUI(),
    nav = useNavigate(),
    loc = useLocation(),
    [open, setOpen] = useState(false),
    [reset, setReset] = useState(false),
    [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (step === null) return;
    const id = setTimeout(() => {
      const el = document.querySelector(tour[step][3]) ?? document.querySelector('main');
      el?.classList.add('tour-highlight');
    }, 500);
    return () => {
      clearTimeout(id);
      document
        .querySelectorAll('.tour-highlight')
        .forEach((el) => el.classList.remove('tour-highlight'));
    };
  }, [step, loc.pathname, loc.search]);
  function go(n: number) {
    if (n < 0 || n >= tour.length) {
      setStep(null);
      ui.toast('Tour complete. Keep exploring the garage.');
      return;
    }
    setStep(n);
    setOpen(false);
    let path = tour[n][2];
    const state = getState();
    const latest = state.orders.find((o) => o.userId === 'u1');
    if ((n === 5 || n === 7) && latest) path = `/order/${latest.id}`;
    if (n === 6 && latest) path = `/admin/orders/${latest.id}`;
    nav(path);
  }
  function action() {
    const state = getState();
    if (step === 2)
      ui.run(() => {
        login('u1');
        const p = state.products.find((p) => p.id === 'p001');
        if (!p) throw Error('Reset the demo to restore the tour model.');
        const existing = state.cart.find((c) => c.productId === p.id)?.quantity ?? 0;
        if (existing < 3) addToCart(p.id, 3 - existing);
      }, 'Three models added. Open your garage to see the bundle saving.');
    if (step === 4)
      ui.run(() => {
        login('u1');
        const s = getState();
        if (!s.cart.length) addToCart('p001', 3);
        const u = getState().users.find((u) => u.id === 'u1')!;
        const id = placeOrder(u.addresses[0], 'WhatsApp');
        nav(`/order/${id}?confirmed=1`);
      }, 'Tour order placed.');
    if (step === 6)
      ui.run(() => {
        const o = state.orders.find((o) => o.userId === 'u1' && o.status === 'Placed');
        if (!o) throw Error('Place a tour order first.');
        advanceOrder(o.id);
      }, 'Order confirmed. The collector timeline updated.');
    if (step === 9) ui.run(simulateSyncFailure, 'A failed sync job was created.');
    if (step === 10)
      ui.run(() => {
        setOffline(false);
        transact((d) => {
          d.tally.failureRate = 0;
        });
        retryAll();
      }, 'Tally online. Retrying with 0% failure for this tour.');
    if (step === 11) ui.run(pullStock, 'Stock snapshot pulled. Open Reconciliation to compare.');
  }
  const actionLabels: Record<number, string> = {
    2: 'Add 3 starter models',
    4: 'Place tour order',
    6: 'Confirm tour order',
    9: 'Create failed sync',
    10: 'Bring online & retry',
    11: 'Pull stock snapshot',
  };
  return (
    <>
      <button
        className="demo-fab"
        onClick={() => {
          setOpen(!open);
        }}
        aria-expanded={open}
      >
        <Sparkles size={17} /> Demo <span />
      </button>
      {open && (
        <div className="demo-panel" role="dialog" aria-label="Demo controls">
          <div className="modal-heading">
            <h2>TAKE IT FOR A SPIN.</h2>
            <button
              className="icon-btn"
              aria-label="Close demo panel"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <p>A complete collector store, in one browser. Try every side of the business.</p>
          <button
            className="btn btn-primary full"
            onClick={() => {
              login('u1');
              go(0);
            }}
          >
            <Play size={16} /> Start guided tour
          </button>
          <div className="demo-switches">
            <button
              onClick={() => {
                transact((d) => {
                  d.role = 'customer';
                });
                nav('/');
                setOpen(false);
              }}
            >
              Customer view <ArrowRight size={14} />
            </button>
            <button
              onClick={() => {
                transact((d) => {
                  d.role = 'admin';
                });
                nav('/admin');
                setOpen(false);
              }}
            >
              Admin view <ArrowRight size={14} />
            </button>
          </div>
          <label>
            Demo collector
            <select
              value={s.userId ?? ''}
              onChange={(e) => ui.run(() => login(e.target.value), 'Demo collector switched.')}
            >
              <option value="" disabled>
                Select collector
              </option>
              {s.users
                .filter((u) => u.role === 'customer')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <h3>SIMULATE AN EVENT</h3>
          <div className="demo-events">
            <button
              onClick={() => ui.run(simulateOrder, 'New order arrived. Stock & sync jobs updated.')}
            >
              <ShoppingBag size={16} /> New order arrives
            </button>
            <button onClick={() => ui.run(simulateLowStock, 'A model now has low stock.')}>
              <Boxes size={16} /> Stock runs low
            </button>
            <button
              onClick={() =>
                ui.run(
                  () => {
                    setOffline(!s.tally.offline);
                  },
                  s.tally.offline ? 'Tally is online again.' : 'Tally is now offline.',
                )
              }
            >
              <Plug size={16} /> {s.tally.offline ? 'Bring Tally online' : 'Tally goes offline'}
            </button>
            <button
              onClick={() => ui.run(simulateSyncFailure, 'Created a failed sync for the demo.')}
            >
              <RotateCcw size={16} /> Create failed sync
            </button>
          </div>
          <Link to="/features" className="text-link" onClick={() => setOpen(false)}>
            Explore every feature <ArrowRight size={14} />
          </Link>
          <button className="demo-reset" onClick={() => setReset(true)}>
            <RotateCcw size={14} /> Reset demo data
          </button>
        </div>
      )}
      {step !== null && (
        <div className="tour-card" role="region" aria-label="Guided tour">
          <div className="tour-top">
            <span>THE TINY KARS WALKTHROUGH</span>
            <button className="icon-btn" aria-label="End guided tour" onClick={() => setStep(null)}>
              <X size={17} />
            </button>
          </div>
          <div className="tour-progress">
            {tour.map((_, i) => (
              <span key={i} className={i <= step ? 'active' : ''} />
            ))}
          </div>
          <small>
            {String(step + 1).padStart(2, '0')} / {tour.length}
          </small>
          <h3>{tour[step][0]}</h3>
          <p>{tour[step][1]}</p>
          {actionLabels[step] && (
            <button className="btn btn-small full" onClick={action}>
              {actionLabels[step]} <Check size={15} />
            </button>
          )}
          <div className="tour-bottom">
            <button className="text-link" disabled={step === 0} onClick={() => go(step - 1)}>
              <ChevronLeft size={14} /> Back
            </button>
            <button className="btn btn-primary btn-small" onClick={() => go(step + 1)}>
              {step === tour.length - 1 ? 'Finish tour' : 'Next step'} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
      {reset && (
        <Modal title="Reset the demo garage?" onClose={() => setReset(false)}>
          <p>
            This restores the original catalogue, demo accounts, orders, and sync history. Your demo
            changes will be cleared in this browser.
          </p>
          <button
            className="btn btn-primary full"
            onClick={() => {
              resetDemo();
              setReset(false);
              setOpen(false);
              setStep(null);
              nav('/');
              ui.toast('Fresh garage. Demo data restored.');
            }}
          >
            Reset all demo data <RotateCcw size={16} />
          </button>
        </Modal>
      )}
    </>
  );
}
