import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Truck,
  PackageCheck,
  ChevronLeft,
  ChevronRight,
  Star,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { asset, money } from '../services/format';
import ProductCard from '../components/ProductCard';
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
export default function Home() {
  const state = useStore(),
    [tab, setTab] = useState('Fresh drops'),
    [offset, setOffset] = useState(0);
  const products =
    tab === 'Rare finds'
      ? state.products.filter((p) => p.rare)
      : [...state.products].sort((a, b) =>
          tab === 'Best sellers' ? b.sold - a.sold : b.arrival - a.arrival,
        );
  const rare = state.products.filter((p) => p.rare);
  return (
    <>
      <section className="hero" data-tour="hero">
        <img
          className="hero-image"
          src={asset('assets/hero.webp')}
          srcSet={`${asset('assets/hero-mobile.webp')} 1100w, ${asset('assets/hero.webp')} 1600w`}
          sizes="(max-width: 640px) 145vw, 100vw"
          alt="Cherry-red miniature muscle car with black racing stripes under studio lights"
          fetchPriority="high"
          width="1774"
          height="887"
        />
        <div className="hero-shade" />
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
              <Link className="btn btn-primary" to="/shop">
                Find your next collectible <ArrowUpRight size={20} />
              </Link>
              <Link className="hero-secondary" to="/shop?rare=1">
                Explore rare finds <ArrowRight size={17} />
              </Link>
            </div>
            <div className="collector-proof">
              <div className="avatar-stack">
                <span>AM</span>
                <span>PS</span>
                <span>KR</span>
                <span>+</span>
              </div>
              <div>
                <div className="stars">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={12} fill="currentColor" />
                  ))}
                </div>
                <small>For collectors. By collectors.</small>
              </div>
            </div>
          </div>
          <Link className="hero-model" to="/product/p003">
            <span className="model-label">IN THE SPOTLIGHT</span>
            <strong>1969 Chevrolet Camaro</strong>
            <span>
              1:64 scale · Pure muscle <ArrowUpRight size={17} />
            </span>
          </Link>
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
      <section className="container brand-section">
        <div className="section-kicker">THE NAMES YOU KNOW. THE MODELS YOU WANT.</div>
        <div className="brand-rail">
          {brands.map((brand, i) => (
            <Link
              key={brand}
              to={`/shop?brand=${encodeURIComponent(brand)}`}
              className={`brand-tile brand-${i}`}
            >
              <strong>{brand}</strong>
              <span>
                {state.products.filter((p) => p.brand === brand).length} models{' '}
                <ArrowUpRight size={13} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="container drops-section">
        <div className="section-top">
          <div>
            <span className="eyebrow red">STRAIGHT TO YOUR SHELF</span>
            <h2>
              YOUR NEXT <em>OBSESSION.</em>
            </h2>
          </div>
          <Link to="/shop" className="text-link">
            Shop the collection <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="collection-tabs" role="tablist" aria-label="Featured collection">
          {['Fresh drops', 'Best sellers', 'Rare finds'].map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'active' : ''}
              onClick={() => setTab(t)}
            >
              {t}
              {t === 'Fresh drops' && <span>JUST IN</span>}
            </button>
          ))}
          <span className="tabs-caption">Good things come in small scales.</span>
        </div>
        <div className="product-grid" data-tour="browse">
          {products.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      {state.offers.some((o) => o.id === 'bundle' && o.enabled) && (
        <section className="container">
          <div className="offer-banner">
            <div className="offer-stamp">
              STARTER
              <br />
              GARAGE <span>01 / 64</span>
            </div>
            <div>
              <span className="eyebrow">LITTLE PRICE. BIG PERSONALITY.</span>
              <h2>
                THREE'S A <em>COLLECTION.</em>
              </h2>
              <p>
                Pick any 3 marked starter models for just <strong>₹550.</strong> Your shelf will
                thank you.
              </p>
            </div>
            <Link to="/shop?offer=bundle" className="btn btn-dark">
              Build your bundle <ArrowUpRight size={19} />
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
          {['1:64', '1:43', '1:32', '1:24', '1:18'].map((s, i) => (
            <Link key={s} to={`/shop?scale=${s}`}>
              <span className="scale-no">0{i + 1}</span>
              <strong>{s}</strong>
              <span>
                {
                  [
                    'Pocket icons',
                    'Desk favourites',
                    'A closer look',
                    'Statement pieces',
                    'Centre of attention',
                  ][i]
                }
                <ArrowUpRight size={17} />
              </span>
            </Link>
          ))}
        </div>
        <div className="budget-row">
          <span>EVERY COLLECTOR. EVERY BUDGET.</span>
          {[499, 799, 999, 1499].map((p) => (
            <Link key={p} to={`/shop?max=${p}`}>
              Under {money(p)} <ArrowUpRight size={14} />
            </Link>
          ))}
        </div>
      </section>
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
                  disabled={offset >= rare.length - 3}
                  onClick={() => setOffset(Math.min(rare.length - 3, offset + 1))}
                >
                  <ChevronRight />
                </button>
                <Link className="text-link" to="/shop?rare=1">
                  All rare finds <ArrowUpRight size={17} />
                </Link>
              </div>
            </div>
          </div>
          <div className="product-grid rare-grid">
            {rare.slice(offset, offset + 3).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>
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
        <Link className="btn btn-primary" to="/shop">
          Make some shelf space <ArrowUpRight size={18} />
        </Link>
        <div className="closing-trust">
          <span>
            <Truck size={17} /> Free shipping above ₹1,499
          </span>
          <span>
            <ShieldCheck size={17} /> COD available
          </span>
          <span>
            <PackageCheck size={17} /> 7-day returns
          </span>
        </div>
      </section>
    </>
  );
}
