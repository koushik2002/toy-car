import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  ShoppingBag,
  Heart,
  UserRound,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  ShieldCheck,
  Truck,
  PackageCheck,
  Instagram,
  ArrowUpRight,
} from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { cartTotals, setQuantity } from '../services/cart';
import { asset, money } from '../services/format';
import { transact, storage } from '../services/storage';
import { Modal, Quantity, Empty, useUI } from './UI';
export function Logo() {
  return (
    <Link to="/" aria-label="Tiny Kars home. Diecast. Done right." className="brand">
      <img src={asset('assets/brand/logo.jpg')} alt="Tiny Kars" width="1024" height="1024" />
      <span>DIECAST. DONE RIGHT.</span>
    </Link>
  );
}
const brands = [
  'Hot Wheels',
  'Mini GT',
  'Matchbox',
  'Majorette',
  'Bburago',
  'CCA',
  'Inno64',
  'Pop Race',
  'Tomica',
];
export function Layout({ children }: { children: React.ReactNode }) {
  const state = useStore(),
    ui = useUI(),
    nav = useNavigate(),
    location = useLocation();
  const [query, setQuery] = useState(''),
    [menu, setMenu] = useState(false),
    [mega, setMega] = useState(''),
    [searchFocus, setSearchFocus] = useState(false);
  const total = cartTotals(state),
    admin = location.pathname.startsWith('/admin');
  useEffect(() => {
    setMenu(false);
    setMega('');
    setSearchFocus(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname, location.search]);
  const suggestions = state.products
    .filter((p) => `${p.name} ${p.brand} ${p.series}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5);
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
          document.getElementById('main-content')?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <div className="announcement">
        <span>
          <span className="live-dot" /> LITTLE CARS. HUGE COLLECTOR ENERGY.
        </span>
        <Link to="/shop?offer=bundle">
          Starter garage: any 3 for ₹550 <ArrowRight size={13} />
        </Link>
        <span className="announcement-right">PAN-INDIA DELIVERY 🇮🇳</span>
      </div>
      <header className="site-header">
        <div className="container header-main">
          <Logo />
          <div className="header-search">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                nav(`/shop?q=${encodeURIComponent(query)}`);
                setSearchFocus(false);
              }}
            >
              <Search size={19} />
              <input
                aria-label="Search models, brands, or series"
                placeholder="Find your next grail. Search cars, brands & more…"
                value={query}
                onFocus={() => setSearchFocus(true)}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchFocus(false);
                }}
              />
              <kbd>↵</kbd>
            </form>
            {searchFocus && query && (
              <div className="search-suggestions">
                {suggestions.length ? (
                  suggestions.map((p) => (
                    <Link to={`/product/${p.id}`} key={p.id}>
                      <img src={asset(p.image)} alt="" />
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.brand} · {p.scale}
                        </small>
                      </span>
                      <b>{money(p.price)}</b>
                    </Link>
                  ))
                ) : (
                  <p>No models found. Try “Nissan”.</p>
                )}
                <Link to={`/shop?q=${encodeURIComponent(query)}`} className="search-all">
                  See all results <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </div>
          <div className="header-actions">
            <Link to="/account" className="icon-btn" aria-label="Your account">
              <UserRound size={21} />
              <span>Account</span>
            </Link>
            <Link to="/wishlist" className="icon-btn" aria-label="Wishlist">
              <Heart size={21} />
              {state.wishlist.length > 0 && <i>{state.wishlist.length}</i>}
              <span>Wishlist</span>
            </Link>
            <button
              data-cart
              className="icon-btn"
              aria-label={`Open cart, ${total.count} items`}
              onClick={ui.openCart}
            >
              <ShoppingBag size={22} />
              <i>{total.count}</i>
              <span>Your garage</span>
            </button>
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        <div className={`nav-wrap ${menu ? 'nav-open' : ''}`}>
          <div className="container nav-inner">
            <nav aria-label="Main navigation">
              <NavLink to="/shop">All collectibles</NavLink>
              <div className="mega-trigger">
                <button
                  aria-expanded={mega === 'brands'}
                  onClick={() => setMega(mega === 'brands' ? '' : 'brands')}
                >
                  Shop by brand <ChevronDown size={13} />
                </button>
                {mega === 'brands' && (
                  <div className="mega-menu">
                    <div className="mega-title">
                      THE MAKERS OF YOUR OBSESSION
                      <button
                        className="icon-btn"
                        aria-label="Close brand menu"
                        onClick={() => setMega('')}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="mega-grid">
                      {brands.map((b) => (
                        <div key={b}>
                          <Link className="mega-brand" to={`/shop?brand=${encodeURIComponent(b)}`}>
                            {b}
                            <ArrowUpRight size={15} />
                          </Link>
                          {(b === 'Hot Wheels'
                            ? ['Mainline', 'Premium', 'RLC', 'Treasure Hunt']
                            : ['Street Icons', 'Collector Series', 'Chase']
                          ).map((s) => (
                            <Link
                              key={s}
                              to={`/shop?brand=${encodeURIComponent(b)}&series=${encodeURIComponent(s)}`}
                            >
                              {s}
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="mega-trigger">
                <button
                  aria-expanded={mega === 'scale'}
                  onClick={() => setMega(mega === 'scale' ? '' : 'scale')}
                >
                  Shop by scale <ChevronDown size={13} />
                </button>
                {mega === 'scale' && (
                  <div className="mini-menu">
                    {['1:64', '1:43', '1:32', '1:24', '1:18'].map((s) => (
                      <Link key={s} to={`/shop?scale=${s}`}>
                        {s} scale <ArrowRight size={15} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div className="mega-trigger">
                <button
                  aria-expanded={mega === 'budget'}
                  onClick={() => setMega(mega === 'budget' ? '' : 'budget')}
                >
                  Shop by budget <ChevronDown size={13} />
                </button>
                {mega === 'budget' && (
                  <div className="mini-menu">
                    {[499, 799, 999, 1499].map((s) => (
                      <Link key={s} to={`/shop?max=${s}`}>
                        Under {money(s)} <ArrowRight size={15} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <NavLink to="/shop?rare=1" className="rare-nav">
                ✦ Rare finds
              </NavLink>
              <NavLink to="/shop?offer=bundle">
                Offers <span className="nav-tag">HOT</span>
              </NavLink>
            </nav>
            <button
              className="role-toggle"
              onClick={() => {
                transact((d) => {
                  d.role = admin ? 'customer' : 'admin';
                });
                nav(admin ? '/' : '/admin');
              }}
            >
              {admin ? '↗ Customer view' : '↗ Admin demo'}
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <Logo />
            <p>
              Small cars. Big stories.
              <br />
              Your next favourite collectible is right here.
            </p>
            <Link className="footer-social" to="/features">
              <Instagram size={18} /> Explore the Tiny Kars demo <ArrowUpRight size={15} />
            </Link>
          </div>
          <div>
            <h3>YOUR NEXT FIND</h3>
            <Link to="/shop">All collectibles</Link>
            <Link to="/shop?sort=newest">New arrivals</Link>
            <Link to="/shop?rare=1">Rare finds</Link>
            <Link to="/shop?offer=bundle">Starter Garage</Link>
          </div>
          <div>
            <h3>THE COLLECTOR'S CORNER</h3>
            <Link to="/account">My account & orders</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/account/addresses">Saved addresses</Link>
            <Link to="/features">Explore every feature</Link>
          </div>
          <div>
            <h3>BUILT FOR THE LONG RUN</h3>
            <p>
              <ShieldCheck size={16} /> Collector-graded models
            </p>
            <p>
              <Truck size={16} /> 48-hour dispatch
            </p>
            <p>
              <PackageCheck size={16} /> Careful, secure packaging
            </p>
            <span className="footer-demo-label">Interactive sales demo · no real payments</span>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Tiny Kars. Made for the collector in you.</span>
          <span className="design-credit">
            Designed by <strong>ShwaaS.ai</strong>
          </span>
          <span>
            INDIA · INR ₹ <span className="payment-marks">WHATSAPP ORDERS</span>
          </span>
        </div>
      </footer>
      {storage.isTemporary() && (
        <div className="storage-notice" role="status">
          Browser storage is unavailable or full. Changes are saved in memory for this session.
        </div>
      )}
      {ui.cartOpen && <CartDrawer />}
    </>
  );
}
export function CartDrawer() {
  const state = useStore(),
    ui = useUI();
  const t = cartTotals(state);
  return (
    <Modal title={`Your garage (${t.count})`} onClose={ui.closeCart} className="drawer">
      <div className="drawer-body">
        {!t.count ? (
          <Empty title="Room for your next obsession" detail="Add a model to start your garage.">
            <Link className="btn btn-primary" to="/shop" onClick={ui.closeCart}>
              Explore collectibles <ArrowRight size={16} />
            </Link>
          </Empty>
        ) : (
          <>
            <ShippingProgress value={t.subtotal - t.discount} />
            {t.lines.map((l) => (
              <div className="cart-line" key={l.product.id}>
                <Link to={`/product/${l.product.id}`} onClick={ui.closeCart}>
                  <img src={asset(l.product.image)} alt={l.product.name} />
                </Link>
                <div>
                  <small>
                    {l.product.brand} · {l.product.scale}
                  </small>
                  <Link to={`/product/${l.product.id}`} onClick={ui.closeCart}>
                    {l.product.name}
                  </Link>
                  <strong>{money(l.product.price)}</strong>
                  <Quantity
                    value={l.quantity}
                    max={l.product.stock}
                    onChange={(q) => ui.run(() => setQuantity(l.product.id, q))}
                  />
                </div>
                <button
                  className="icon-btn"
                  aria-label={`Remove ${l.product.name}`}
                  onClick={() => ui.run(() => setQuantity(l.product.id, 0))}
                >
                  <X size={17} />
                </button>
              </div>
            ))}
            <div className="drawer-summary">
              <Totals />
              <Link className="btn btn-primary full" to="/checkout" onClick={ui.closeCart}>
                Head to checkout <ArrowRight size={18} />
              </Link>
              <Link className="text-link" to="/cart" onClick={ui.closeCart}>
                View full garage
              </Link>
              <small className="muted">Order on WhatsApp · payment arranged with the shop</small>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
export function ShippingProgress({ value }: { value: number }) {
  return (
    <div className="shipping-progress">
      <p>
        <Truck size={16} />
        {value >= 1499
          ? 'You unlocked free shipping!'
          : `${money(1499 - value)} away from free shipping`}
      </p>
      <div>
        <span style={{ width: `${Math.min(100, (value / 1499) * 100)}%` }} />
      </div>
    </div>
  );
}
export function Totals() {
  const t = cartTotals(useStore());
  return (
    <div className="totals">
      <p>
        <span>Subtotal</span>
        <span>{money(t.subtotal)}</span>
      </p>
      {t.bundle > 0 && (
        <p className="saving">
          <span>Any 3 for ₹550 — auto applied</span>
          <span>−{money(t.bundle)}</span>
        </p>
      )}
      {t.free > 0 && (
        <p className="saving">
          <span>Buy 2, get 1 free — auto applied</span>
          <span>−{money(t.free)}</span>
        </p>
      )}
      {t.couponDiscount > 0 && (
        <p className="saving">
          <span>Coupon saving</span>
          <span>−{money(t.couponDiscount)}</span>
        </p>
      )}
      <p>
        <span>Shipping</span>
        <span>{t.shipping ? money(t.shipping) : 'FREE'}</span>
      </p>
      {t.gst > 0 && (
        <p>
          <span>GST</span>
          <span>{money(t.gst)}</span>
        </p>
      )}
      <p className="total">
        <strong>Total</strong>
        <strong>{money(t.total)}</strong>
      </p>
      {t.gst > 0 ? (
        <small className="muted">GST: {money(t.gst)} · included in total.</small>
      ) : (
        <small className="muted">No GST charged.</small>
      )}
    </div>
  );
}
