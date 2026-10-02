import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  Heart,
  ShieldCheck,
  Truck,
  PackageCheck,
  ZoomIn,
  Bell,
  ShoppingBag,
} from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { asset, money } from '../services/format';
import { delivery } from '../services/orders';
import { toggleWishlist } from '../services/cart';
import { transact } from '../services/storage';
import { useUI, Quantity, Modal, Empty } from '../components/UI';
import ProductCard from '../components/ProductCard';
export default function ProductPage() {
  const { id } = useParams(),
    state = useStore(),
    ui = useUI(),
    p = state.products.find((p) => p.id === id);
  const [quantity, setQuantity] = useState(1),
    [zoom, setZoom] = useState(false),
    [pin, setPin] = useState(''),
    [estimate, setEstimate] = useState(''),
    [gallery, setGallery] = useState(0);
  if (!p)
    return (
      <div className="container page">
        <Empty
          title="This model has left the garage"
          detail="Explore the collection for another find."
        >
          <Link to="/shop" className="btn btn-primary">
            Browse collectibles
          </Link>
        </Empty>
      </div>
    );
  const offer = state.offers.find((o) => o.id === p.offer && o.enabled);
  const related = state.products
    .filter((x) => x.id !== p.id && (x.brand === p.brand || x.scale === p.scale))
    .slice(0, 4);
  return (
    <div className="container page">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight size={13} />
        <Link to="/shop">Collection</Link>
        <ChevronRight size={13} />
        {p.brand}
      </div>
      <div className="product-detail">
        <div>
          <button
            className={`detail-image gallery-${gallery}`}
            aria-label="Zoom product image"
            onClick={() => setZoom(true)}
          >
            <img
              src={asset(p.image)}
              alt={`${p.name} illustrative diecast model`}
              width="700"
              height="600"
            />
            {p.rare && <span className="rare-badge">✦ RARE FIND</span>}
            <span className="zoom-hint">
              <ZoomIn size={18} /> Tap for a closer look
            </span>
          </button>
          <div className="gallery-thumbs">
            {['Studio view', 'Detail crop', 'Collector view'].map((v, i) => (
              <button
                key={v}
                className={gallery === i ? 'active' : ''}
                aria-label={v}
                onClick={() => setGallery(i)}
              >
                <img src={asset(p.image)} className={`gallery-${i}`} alt={v} />
              </button>
            ))}
            <p>
              Original demo artwork.
              <br />
              Model colours & packaging are illustrative.
            </p>
          </div>
        </div>
        <div className="product-description">
          <span className="eyebrow red">
            {p.brand} / {p.series}
          </span>
          <h1>{p.name}</h1>
          <div className="detail-tags">
            <span>{p.scale} SCALE</span>
            <span>{p.condition}</span>
            <span>{p.sku}</span>
          </div>
          <p className="detail-copy">{p.description}</p>
          <div className="detail-price">
            <strong>{money(p.price)}</strong>
            <del>{money(p.mrp)}</del>
            <span>Save {money(p.mrp - p.price)}</span>
          </div>
          <small className="muted">Inclusive of all taxes</small>
          <p className={`detail-stock ${p.stock <= p.threshold ? 'low' : ''}`}>
            {p.stock
              ? `● ${p.stock <= p.threshold ? `Only ${p.stock} left. This one's a keeper.` : 'In stock & ready for your shelf.'}`
              : '● Sold out. The hunt isn’t over.'}
          </p>
          {offer && (
            <div className="detail-offer">
              {(offer.rule ?? offer.id) === 'bundle'
                ? 'Starter Garage: any 3 marked models for ₹550.'
                : 'Collector offer: buy 2 marked models, get the lowest-priced third free.'}{' '}
              <Link to={`/shop?offer=${p.offer}`}>
                Explore eligible models <ArrowRight size={14} />
              </Link>
            </div>
          )}
          <div className="detail-buy">
            {p.stock > 0 ? (
              <>
                <Quantity value={quantity} max={p.stock} onChange={setQuantity} />
                <button
                  className="btn btn-primary"
                  onClick={(e) => ui.add(p.id, quantity, e.currentTarget)}
                >
                  <ShoppingBag size={18} /> Add to your garage
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() =>
                  ui.run(
                    () =>
                      transact((d) => {
                        if (!d.notifications.includes(p.id)) d.notifications.push(p.id);
                      }),
                    'Restock reminder saved in this demo.',
                  )
                }
              >
                <Bell size={18} />
                {state.notifications.includes(p.id)
                  ? 'Reminder saved'
                  : 'Notify me when it returns'}
              </button>
            )}
            <button
              className={`icon-btn bordered ${state.wishlist.includes(p.id) ? 'red' : ''}`}
              aria-label="Save to wishlist"
              onClick={() => ui.run(() => toggleWishlist(p.id), 'Wishlist updated')}
            >
              <Heart size={20} fill={state.wishlist.includes(p.id) ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="delivery-check">
            <h3>
              <Truck size={19} /> WILL IT REACH YOUR GARAGE?
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ui.run(() => setEstimate(delivery(pin).message));
              }}
            >
              <input
                aria-label="Delivery PIN code"
                inputMode="numeric"
                maxLength={6}
                pattern="[1-9][0-9]{5}"
                required
                placeholder="Enter your PIN code"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
              <button className="btn btn-small">
                Check <ArrowRight size={15} />
              </button>
            </form>
            {estimate && <p role="status">{estimate}</p>}
          </div>
          <div className="detail-trust">
            <span>
              <ShieldCheck size={17} /> Collector graded
            </span>
            <span>
              <PackageCheck size={17} /> 7-day returns
            </span>
            <span>
              <Truck size={17} /> 48-hour dispatch
            </span>
          </div>
        </div>
      </div>
      <section className="related-section">
        <div className="section-top">
          <div>
            <span className="eyebrow red">GOOD COMPANY FOR YOUR SHELF</span>
            <h2>
              KEEP THE <em>HUNT ALIVE.</em>
            </h2>
          </div>
          <Link className="text-link" to="/shop">
            Explore more <ArrowRight size={16} />
          </Link>
        </div>
        <div className="product-grid">
          {related.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      {zoom && (
        <Modal title={p.name} onClose={() => setZoom(false)} className="zoom-modal">
          <div className="zoom-scroll">
            <img src={asset(p.image)} alt={`${p.name} close-up`} />
          </div>
          <small className="muted">Scroll to inspect the original illustrative artwork.</small>
        </Modal>
      )}
    </div>
  );
}
