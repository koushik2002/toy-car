import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
} from 'lucide-react';
import { money, request, type CatalogueProduct, type CatalogueResult } from './api';
import { useSession } from './session';
import { useCart } from './cart';
import { ProductCard } from './ProductCard';
import { useBrowsable, useOffers, useOverview } from './Layout';

const tabs = [
  { label: 'Fresh drops', query: 'sort=newest' },
  { label: 'Best sellers', query: 'sort=popular' },
  { label: 'Rare finds', query: 'rare=true&sort=newest' },
] as const;
const scaleWords: Record<string, string> = {
  '1:64': 'Pocket icons',
  '1:43': 'Desk favourites',
  '1:32': 'A closer look',
  '1:24': 'Statement pieces',
  '1:18': 'Centre of attention',
};
const budgets = [499, 799, 999, 1499];

function useProducts(query: string | null) {
  const [items, setItems] = useState<CatalogueProduct[] | null>(null);
  useEffect(() => {
    if (!query) {
      setItems(null);
      return;
    }
    let live = true;
    setItems(null);
    void request<CatalogueResult>(`/products?${query}`).then(
      (result) => live && setItems(result.items),
      () => live && setItems([]),
    );
    return () => {
      live = false;
    };
  }, [query]);
  return items;
}

function ProductRow({ items, count }: { items: CatalogueProduct[] | null; count: number }) {
  if (!items)
    return (
      <>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </>
    );
  return (
    <>
      {items.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </>
  );
}

function SignInPrompt() {
  return (
    <div className="home-signin panel">
      <span className="eyebrow red">MEMBERS-ONLY GARAGE</span>
      <h3>Sign in to see the full collection.</h3>
      <p>
        Prices, stock and the latest drops are shown to signed-in collectors. Creating an account
        takes a minute.
      </p>
      <div className="home-signin-actions">
        <Link className="btn btn-primary" to="/account/login">
          Sign in <ArrowRight size={17} />
        </Link>
        <Link className="btn" to="/account/register">
          Create an account
        </Link>
      </div>
    </div>
  );
}

export function HomePage() {
  const browsable = useBrowsable();
  const { user } = useSession();
  const overview = useOverview();
  const freeAbove = useCart().freeShippingAbovePaise;
  const [tab, setTab] = useState(0);
  const [offset, setOffset] = useState(0);
  const featured = useProducts(browsable ? `${tabs[tab].query}&limit=4` : null);
  const rare = useProducts(browsable ? 'rare=true&limit=12' : null);
  const spotlightList = useProducts(browsable ? 'sort=popular&limit=1' : null);
  const offerName = useOffers()[0] || '';
  const spotlight = spotlightList?.[0];
  const shop = (path: string) => (browsable ? path : '/account/login');

  const rareItems = rare ?? [];
  const visibleRare = rareItems.slice(offset, offset + 3);

  return (
    <>
      <section className="hero">
        <img
          className="hero-image"
          src={`${import.meta.env.BASE_URL}assets/hero.webp`}
          srcSet={`${import.meta.env.BASE_URL}assets/hero-mobile.webp 1100w, ${import.meta.env.BASE_URL}assets/hero.webp 1600w`}
          sizes="(max-width: 640px) 145vw, 100vw"
          alt="Cherry-red miniature muscle car with black racing stripes under studio lights"
          fetchPriority="high"
          width="1774"
          height="887"
        />
        <div className="hero-shade" />
        <img
          className="hero-mascot"
          src={`${import.meta.env.BASE_URL}assets/brand/mascot.webp`}
          alt=""
          aria-hidden="true"
          width="720"
          height="1080"
          fetchPriority="high"
        />
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> FOR THE LOVE OF THE LITTLE THINGS
            </div>
            <h1>
              SMALL CARS.
              <br />
              <em>BIG OBSESSION.</em>
            </h1>
            <p>
              Some see a toy. You see the details.
              <br />
              Discover diecast icons, rare finds, and the next
              <br className="desktop-break" /> story for your collection.
            </p>
            <div className="hero-cta">
              <Link className="btn btn-primary" to={shop('/shop')}>
                {browsable ? 'Find your next collectible' : 'Sign in to your garage'}{' '}
                <ArrowUpRight size={20} />
              </Link>
              {browsable ? (
                <Link className="hero-secondary" to="/shop?rare=true">
                  Explore rare finds <ArrowRight size={17} />
                </Link>
              ) : (
                <Link className="hero-secondary" to="/account/register">
                  New collector? Create an account <ArrowRight size={17} />
                </Link>
              )}
            </div>
            <div className="collector-proof">
              <div className="avatar-stack" aria-hidden="true">
                <span>AM</span>
                <span>PS</span>
                <span>KR</span>
                <span>+</span>
              </div>
              <div>
                <div className="stars" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={12} fill="currentColor" />
                  ))}
                </div>
                <small>For collectors. By collectors.</small>
              </div>
            </div>
          </div>
          {spotlight && (
            <Link className="hero-model" to={`/product/${spotlight.id}`}>
              <span className="model-label">IN THE SPOTLIGHT</span>
              <strong>{spotlight.name}</strong>
              <span>
                {spotlight.scale} scale · {spotlight.brand} <ArrowUpRight size={17} />
              </span>
            </Link>
          )}
          <div className="hero-bottom">
            <span>
              01 <i /> THE COLLECTOR EDIT
            </span>
            <div>
              <span>METAL BODIES</span>
              <span>ICONIC DETAILS</span>
              <span>ENDLESS STORIES</span>
            </div>
          </div>
        </div>
      </section>
      <div className="promise-strip">
        <div className="container">
          <span>
            <ShieldCheck size={21} />
            <b>Collector-graded</b>
            <small>Every detail matters</small>
          </span>
          <span>
            <Truck size={21} />
            <b>48-hour dispatch</b>
            <small>Your garage can't wait</small>
          </span>
          <span>
            <PackageCheck size={21} />
            <b>Packed with care</b>
            <small>Arrives shelf-ready</small>
          </span>
          <span>
            <Sparkles size={21} />
            <b>New drops, always</b>
            <small>Keep the hunt alive</small>
          </span>
        </div>
      </div>
      {browsable && !!overview?.brands.length && (
        <section className="container brand-section">
          <div className="section-kicker">THE NAMES YOU KNOW. THE MODELS YOU WANT.</div>
          <div className="brand-rail">
            {overview.brands.map((brand, i) => (
              <Link
                key={brand.name}
                to={`/shop?brand=${encodeURIComponent(brand.name)}`}
                className={`brand-tile brand-${i % 9}`}
              >
                <strong>{brand.name}</strong>
                <span>
                  {brand.total} {brand.total === 1 ? 'model' : 'models'} <ArrowUpRight size={13} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="container drops-section">
        <div className="section-top">
          <div>
            <span className="eyebrow red">STRAIGHT TO YOUR SHELF</span>
            <h2>
              YOUR NEXT <em>OBSESSION.</em>
            </h2>
          </div>
          <Link to={shop('/shop')} className="text-link">
            Shop the collection <ArrowUpRight size={17} />
          </Link>
        </div>
        {browsable ? (
          <>
            <div className="collection-tabs" role="tablist" aria-label="Featured collection">
              {tabs.map((item, index) => (
                <button
                  key={item.label}
                  role="tab"
                  aria-selected={tab === index}
                  className={tab === index ? 'active' : ''}
                  onClick={() => setTab(index)}
                >
                  {item.label}
                  {index === 0 && <span>JUST IN</span>}
                </button>
              ))}
              <span className="tabs-caption">Good things come in small scales.</span>
            </div>
            <div className="product-grid">
              <ProductRow items={featured} count={4} />
            </div>
            {featured && !featured.length && (
              <p className="muted">New models are being photographed. Check back soon.</p>
            )}
          </>
        ) : (
          <SignInPrompt />
        )}
      </section>
      {browsable && offerName && (
        <section className="container">
          <div className="offer-banner">
            <div className="offer-stamp">
              {offerName.split(' ')[0].toUpperCase()}
              <br />
              {offerName.split(' ').slice(1).join(' ').toUpperCase() || 'OFFER'}{' '}
              <span>01 / 64</span>
            </div>
            <div>
              <span className="eyebrow">LITTLE PRICE. BIG PERSONALITY.</span>
              <h2>
                THREE'S A <em>COLLECTION.</em>
              </h2>
              <p>
                Explore the models marked <strong>{offerName}</strong>. Your shelf will thank you.
              </p>
            </div>
            <Link to={`/shop?offer=${encodeURIComponent(offerName)}`} className="btn btn-dark">
              See the offer <ArrowUpRight size={19} />
            </Link>
          </div>
        </section>
      )}
      <section className="container scale-section">
        <div className="section-top">
          <div>
            <span className="eyebrow red">FIND YOUR PERFECT FIT</span>
            <h2>
              A WORLD IN <em>MINIATURE.</em>
            </h2>
          </div>
          <span className="muted">The scale is small. The passion isn't.</span>
        </div>
        <div className="scale-grid">
          {Object.keys(scaleWords).map((scale, i) => (
            <Link key={scale} to={shop(`/shop?scale=${encodeURIComponent(scale)}`)}>
              <span className="scale-no">0{i + 1}</span>
              <strong>{scale}</strong>
              <span>
                {scaleWords[scale]}
                <ArrowUpRight size={17} />
              </span>
            </Link>
          ))}
        </div>
        <div className="budget-row">
          <span>EVERY COLLECTOR. EVERY BUDGET.</span>
          {budgets.map((budget) => (
            <Link key={budget} to={shop(`/shop?maxPrice=${budget * 100}`)}>
              Under {money(budget * 100)} <ArrowUpRight size={14} />
            </Link>
          ))}
        </div>
      </section>
      {(!browsable || rareItems.length > 0 || !rare) && (
        <section className="rare-section">
          <div className="container">
            <div className="section-top">
              <div>
                <span className="eyebrow yellow">✦ THE THRILL OF THE HUNT</span>
                <h2>
                  HARD TO FIND.
                  <br />
                  <em>EASY TO FALL FOR.</em>
                </h2>
              </div>
              <div className="rare-section-actions">
                <p>
                  Chase pieces. Treasure hunts. Shelf legends.
                  <br />
                  When they're gone, they're gone.
                </p>
                {browsable && (
                  <div>
                    <button
                      className="icon-btn bordered"
                      aria-label="Previous rare models"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - 1))}
                    >
                      <ChevronLeft />
                    </button>
                    <button
                      className="icon-btn bordered"
                      aria-label="Next rare models"
                      disabled={offset >= rareItems.length - 3}
                      onClick={() => setOffset(Math.min(rareItems.length - 3, offset + 1))}
                    >
                      <ChevronRight />
                    </button>
                    <Link className="text-link" to="/shop?rare=true">
                      All rare finds <ArrowUpRight size={17} />
                    </Link>
                  </div>
                )}
              </div>
            </div>
            {browsable ? (
              <div className="product-grid rare-grid">
                <ProductRow items={rare ? visibleRare : null} count={3} />
              </div>
            ) : (
              <SignInPrompt />
            )}
          </div>
        </section>
      )}
      <section className="container closing-section">
        <span className="eyebrow red">MORE THAN METAL. MORE THAN MINIATURE.</span>
        <h2>
          EVERY GREAT GARAGE
          <br />
          STARTS WITH <em>ONE CAR.</em>
        </h2>
        <p>
          Your first mainline. Your dream JDM. That impossible-to-find chase.
          <br />
          Whatever drives you, there's a little something here for it.
        </p>
        <Link className="btn btn-primary" to={user ? shop('/shop') : '/account/register'}>
          {user ? 'Make some shelf space' : 'Join the collectors'} <ArrowUpRight size={18} />
        </Link>
        <div className="closing-trust">
          <span>
            <Truck size={17} />{' '}
            {freeAbove ? `Free delivery above ${money(freeAbove)}` : 'Pan-India delivery'}
          </span>
          <span>
            <ShieldCheck size={17} /> Secure checkout
          </span>
          <span>
            <PackageCheck size={17} /> 7-day returns
          </span>
        </div>
      </section>
    </>
  );
}
