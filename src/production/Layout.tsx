import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Heart,
  Instagram,
  Menu,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import {
  money,
  request,
  type CatalogueOverview,
  type CatalogueProduct,
  type CatalogueResult,
} from './api';
import { useSession } from './session';
import { useCart } from './cart';
import { useWishlist } from './wishlistStore';
import { Empty, Modal, Photo, Quantity, useUI } from './ui';

const scales = ['1:64', '1:43', '1:32', '1:24', '1:18'];
const budgets = [499, 799, 999, 1499];

export function Logo() {
  return (
    <Link to="/" aria-label="Tiny Kars home. Diecast. Done right." className="brand">
      <img
        src={`${import.meta.env.BASE_URL}assets/brand/logo.jpg`}
        alt="Tiny Kars"
        width="1024"
        height="1024"
      />
      <span>DIECAST. DONE RIGHT.</span>
    </Link>
  );
}

/** Catalogue data is only requested when the visitor is allowed to browse. */
export function useBrowsable() {
  const { user, config } = useSession();
  return !!user || !!config?.catalogue.publicBrowsing;
}

// Several components need the same menu data on one page; share one request per minute.
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
export function cached<T>(path: string, owner: string): Promise<T> {
  const key = `${owner}:${path}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.value as Promise<T>;
  const value = request<T>(path);
  value.catch(() => cache.delete(key));
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Offer names currently on published products. */
export function useOffers() {
  const browsable = useBrowsable();
  const { user } = useSession();
  const [offers, setOffers] = useState<string[]>([]);
  useEffect(() => {
    if (!browsable) return setOffers([]);
    let live = true;
    void cached<CatalogueResult>('/products?limit=1', user?.id || 'guest').then(
      (result) => live && setOffers(result.facets.offers),
      () => live && setOffers([]),
    );
    return () => {
      live = false;
    };
  }, [browsable, user?.id]);
  return offers;
}

/** Shared menu data (brands, scales, free-delivery threshold). */
export function useOverview() {
  const browsable = useBrowsable();
  const { user } = useSession();
  const [overview, setOverview] = useState<CatalogueOverview | null>(null);
  useEffect(() => {
    if (!browsable) {
      setOverview(null);
      return;
    }
    let live = true;
    void cached<CatalogueOverview>('/products/overview', user?.id || 'guest').then(
      (value) => live && setOverview(value),
      () => live && setOverview(null),
    );
    return () => {
      live = false;
    };
  }, [browsable, user?.id]);
  return overview;
}

function teamLink(role: string | undefined) {
  if (role === 'seller') return { to: '/admin/billing', label: 'Billing desk' };
  if (role === 'staff') return { to: '/admin/orders', label: 'Order desk' };
  if (role === 'admin' || role === 'super_admin') return { to: '/admin', label: 'Control room' };
  return null;
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, config } = useSession();
  const cart = useCart();
  const wishlist = useWishlist();
  const ui = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const browsable = useBrowsable();
  const overview = useOverview();
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [mega, setMega] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [suggestions, setSuggestions] = useState<CatalogueProduct[]>([]);
  const offers = useOffers();
  const hasOffers = offers.length > 0;
  const offerLink = `/shop?offer=${encodeURIComponent(offers[0] || '')}`;
  const team = teamLink(user?.role);
  const loginTo = `/account/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  useEffect(() => {
    setMenu(false);
    setMega('');
    setSearchFocus(false);
    ui.closeCart();
    window.scrollTo({ top: 0, behavior: 'instant' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useEffect(() => {
    const term = query.trim();
    if (!browsable || !term) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void request<CatalogueResult>(`/products?q=${encodeURIComponent(term)}&limit=5`, {
        signal: controller.signal,
      }).then(
        (result) => setSuggestions(result.items),
        () => {},
      );
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, browsable]);

  const brands = overview?.brands ?? [];
  const freeAbove = cart.freeShippingAbovePaise;

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
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
        {hasOffers ? (
          <Link to={offerLink}>
            {offers[0]} offers are live <ArrowRight size={13} />
          </Link>
        ) : freeAbove ? (
          <span>Free delivery above {money(freeAbove)}</span>
        ) : (
          <span>
            {config?.commerce.checkoutEnabled
              ? config.commerce.paymentMode === 'test'
                ? 'Local test checkout'
                : 'Secure online payment'
              : 'Online ordering opens soon'}
          </span>
        )}
        <span className="announcement-right">
          {freeAbove && hasOffers
            ? `FREE DELIVERY ABOVE ${money(freeAbove)}`
            : 'PAN-INDIA DELIVERY 🇮🇳'}
        </span>
      </div>
      <header className="site-header">
        <div className="container header-main">
          <Logo />
          <div className="header-search">
            <form
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                setSearchFocus(false);
                navigate(browsable ? `/shop?q=${encodeURIComponent(query.trim())}` : loginTo);
              }}
            >
              <Search size={19} />
              <input
                aria-label="Search models, brands, or series"
                placeholder={
                  browsable
                    ? 'Find your next grail. Search cars, brands & more…'
                    : 'Sign in to search the collection…'
                }
                value={query}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setTimeout(() => setSearchFocus(false), 150)}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSearchFocus(false);
                }}
              />
              <kbd>↵</kbd>
            </form>
            {searchFocus && query.trim() && browsable && (
              <div className="search-suggestions">
                {suggestions.length ? (
                  suggestions.map((product) => (
                    <Link to={`/product/${product.id}`} key={product.id}>
                      <Photo url={product.images[0]?.url} alt="" />
                      <span>
                        <strong>{product.name}</strong>
                        <small>
                          {product.brand} · {product.scale}
                        </small>
                      </span>
                      <b>{money(product.pricePaise)}</b>
                    </Link>
                  ))
                ) : (
                  <p>No models found yet. Try a brand such as “Hot Wheels”.</p>
                )}
                <Link to={`/shop?q=${encodeURIComponent(query.trim())}`} className="search-all">
                  See all results <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </div>
          <div className="header-actions">
            <Link
              to={user ? '/account' : '/account/login'}
              className="icon-btn"
              aria-label={user ? 'Your account' : 'Sign in'}
            >
              <UserRound size={21} />
              <span>{user ? 'Account' : 'Sign in'}</span>
            </Link>
            {user?.role !== 'customer' && user ? null : (
              <Link
                to="/wishlist"
                className="icon-btn"
                aria-label={`Wishlist, ${wishlist.ids.size} saved`}
              >
                <Heart size={21} />
                {wishlist.ids.size > 0 && <i>{wishlist.ids.size}</i>}
                <span>Wishlist</span>
              </Link>
            )}
            <button
              data-cart
              className="icon-btn"
              aria-label={`Open cart, ${cart.count} items`}
              onClick={ui.openCart}
            >
              <ShoppingBag size={22} />
              <i>{cart.count}</i>
              <span>Your garage</span>
            </button>
            <button
              className="icon-btn mobile-menu"
              aria-label={menu ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        <div className={`nav-wrap ${menu ? 'nav-open' : ''}`}>
          <div className="container nav-inner">
            <nav aria-label="Main navigation">
              {browsable ? (
                <>
                  <NavLink to="/shop" end>
                    All collectibles
                  </NavLink>
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
                          {brands.map((brand) => (
                            <div key={brand.name}>
                              <Link
                                className="mega-brand"
                                to={`/shop?brand=${encodeURIComponent(brand.name)}`}
                              >
                                {brand.name}
                                <ArrowUpRight size={15} />
                              </Link>
                              {brand.series.map((series) => (
                                <Link
                                  key={series}
                                  to={`/shop?brand=${encodeURIComponent(brand.name)}&series=${encodeURIComponent(series)}`}
                                >
                                  {series}
                                </Link>
                              ))}
                            </div>
                          ))}
                          {!brands.length && <p>Brands appear once products are published.</p>}
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
                        {(overview?.scales.map((scale) => scale.name) ?? scales).map((scale) => (
                          <Link key={scale} to={`/shop?scale=${encodeURIComponent(scale)}`}>
                            {scale} scale <ArrowRight size={15} />
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
                        {budgets.map((budget) => (
                          <Link key={budget} to={`/shop?maxPrice=${budget * 100}`}>
                            Under {money(budget * 100)} <ArrowRight size={15} />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <NavLink to="/shop?rare=true" className="rare-nav">
                    ✦ Rare finds
                  </NavLink>
                  {hasOffers && (
                    <NavLink to={offerLink}>
                      Offers <span className="nav-tag">HOT</span>
                    </NavLink>
                  )}
                </>
              ) : (
                <>
                  <NavLink to="/account/login">Sign in to browse the collection</NavLink>
                  <NavLink to="/account/register">
                    New collector? Create an account <span className="nav-tag">FREE</span>
                  </NavLink>
                </>
              )}
            </nav>
            {team && (
              <Link className="role-toggle" to={team.to}>
                ↗ {team.label}
              </Link>
            )}
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
            <Link
              className="footer-social"
              to={browsable ? '/shop?sort=newest' : '/account/register'}
            >
              <Instagram size={18} /> {browsable ? 'See the latest drops' : 'Join the collectors'}{' '}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <div>
            <h3>YOUR NEXT FIND</h3>
            <Link to={browsable ? '/shop' : loginTo}>All collectibles</Link>
            <Link to={browsable ? '/shop?sort=newest' : loginTo}>New arrivals</Link>
            <Link to={browsable ? '/shop?rare=true' : loginTo}>Rare finds</Link>
            <Link to="/cart">Your garage</Link>
          </div>
          <div>
            <h3>THE COLLECTOR'S CORNER</h3>
            <Link to="/account">My account & orders</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/account/addresses">Saved addresses</Link>
            <Link to="/account/rewards">Rewards & store credit</Link>
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
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Tiny Kars. Made for the collector in you.</span>
          <span className="design-credit">
            Designed by <strong>ShwaaS.ai</strong>
          </span>
          <span>
            INDIA · INR ₹{' '}
            {config?.commerce.paymentMode === 'razorpay' && (
              <span className="payment-marks">SECURE RAZORPAY PAYMENTS</span>
            )}
          </span>
        </div>
      </footer>
      {ui.cartOpen && <CartDrawer />}
    </>
  );
}

export function ShippingProgress({ value }: { value: number }) {
  const freeAbove = useCart().freeShippingAbovePaise;
  if (!freeAbove) return null;
  return (
    <div className="shipping-progress">
      <p>
        <Truck size={16} />
        {value >= freeAbove
          ? 'You unlocked free delivery!'
          : `${money(freeAbove - value)} away from free delivery`}
      </p>
      <div>
        <span style={{ width: `${Math.min(100, (value / freeAbove) * 100)}%` }} />
      </div>
    </div>
  );
}

/** Cart totals before checkout. Shipping, vouchers and credit are confirmed by the server quote. */
export function CartTotals({ discountPaise = 0 }: { discountPaise?: number }) {
  const cart = useCart();
  const freeAbove = cart.freeShippingAbovePaise;
  const shippingPaise =
    cart.shippingBasePaise === null
      ? null
      : freeAbove !== null && cart.subtotalPaise >= freeAbove
        ? 0
        : cart.shippingBasePaise;
  const estimatedTotal = Math.max(0, cart.subtotalPaise + (shippingPaise ?? 0) - discountPaise);
  return (
    <div className="totals">
      <p>
        <span>
          Subtotal ({cart.count} {cart.count === 1 ? 'model' : 'models'})
        </span>
        <span>{money(cart.subtotalPaise)}</span>
      </p>
      <p>
        <span>Shipping</span>
        <span>
          {shippingPaise === null ? 'At checkout' : shippingPaise ? money(shippingPaise) : 'FREE'}
        </span>
      </p>
      {discountPaise > 0 && (
        <p className="saving">
          <span>Voucher preview</span>
          <span>−{money(discountPaise)}</span>
        </p>
      )}
      <p className="total">
        <strong>Estimated total</strong>
        <strong>{money(estimatedTotal)}</strong>
      </p>
      <small className="muted">
        Delivery, vouchers, store credit and points are recalculated by the server at checkout.
      </small>
    </div>
  );
}

export function CartLineItem({
  product,
  quantity,
  onNavigate,
  page = false,
}: {
  product: CatalogueProduct;
  quantity: number;
  onNavigate?: () => void;
  page?: boolean;
}) {
  const cart = useCart();
  return (
    <article className={`cart-line ${page ? 'cart-page-line' : ''}`}>
      <Link to={`/product/${product.id}`} onClick={onNavigate} aria-label={`View ${product.name}`}>
        <Photo url={product.images[0]?.url} alt={product.name} />
      </Link>
      <div>
        <small>
          {[product.brand, product.scale, page ? product.condition : '']
            .filter(Boolean)
            .join(' · ')}
        </small>
        <Link to={`/product/${product.id}`} onClick={onNavigate}>
          {product.name}
        </Link>
        {page && product.series && <span className="muted">{product.series}</span>}
        {!page && <strong>{money(product.pricePaise)}</strong>}
        {page && product.offer && <span className="saving">{product.offer}</span>}
        <Quantity
          value={quantity}
          max={Math.max(1, product.available)}
          label={`quantity of ${product.name}`}
          onChange={(value) => cart.setQuantity(product.id, value)}
        />
      </div>
      {page ? (
        <div className="line-price">
          <strong>{money(product.pricePaise * quantity)}</strong>
          <small>{money(product.pricePaise)} each</small>
          <button
            className="icon-btn"
            aria-label={`Remove ${product.name}`}
            onClick={() => cart.remove(product.id)}
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <button
          className="icon-btn"
          aria-label={`Remove ${product.name}`}
          onClick={() => cart.remove(product.id)}
        >
          <X size={17} />
        </button>
      )}
    </article>
  );
}

export function CartDrawer() {
  const cart = useCart();
  const ui = useUI();
  const { user } = useSession();
  return (
    <Modal title={`Your garage (${cart.count})`} onClose={ui.closeCart} className="drawer">
      <div className="drawer-body">
        {!cart.count ? (
          <Empty title="Room for your next obsession" detail="Add a model to start your garage.">
            <Link className="btn btn-primary" to="/shop" onClick={ui.closeCart}>
              Explore collectibles <ArrowRight size={16} />
            </Link>
          </Empty>
        ) : (
          <>
            <ShippingProgress value={cart.subtotalPaise} />
            {cart.lines.map((line) => (
              <CartLineItem
                key={line.product.id}
                product={line.product}
                quantity={line.quantity}
                onNavigate={ui.closeCart}
              />
            ))}
            <div className="drawer-summary">
              <CartTotals />
              <Link
                className="btn btn-primary full"
                to={user ? '/checkout' : '/account/login?next=%2Fcheckout'}
                onClick={ui.closeCart}
              >
                {user ? 'Head to checkout' : 'Sign in to check out'} <ArrowRight size={18} />
              </Link>
              <Link className="text-link" to="/cart" onClick={ui.closeCart}>
                View full garage
              </Link>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
