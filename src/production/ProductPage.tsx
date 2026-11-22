import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  ChevronRight,
  Heart,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Truck,
  ZoomIn,
} from 'lucide-react';
import { money, mutate, request, type CatalogueProduct, type CatalogueResult } from './api';
import { useSession } from './session';
import { useWishlist } from './wishlistStore';
import { Empty, ErrorPanel, Modal, PageLoading, Photo, Quantity } from './ui';
import { isLowStock, ProductCard, useAddToCart } from './ProductCard';

const viewNames = [
  'Front three-quarter',
  'Rear three-quarter',
  'Side detail',
  'Front detail',
  'Roof and interior',
];

export function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, config } = useSession();
  const wishlist = useWishlist();
  const add = useAddToCart();
  const [product, setProduct] = useState<CatalogueProduct | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [related, setRelated] = useState<CatalogueProduct[]>([]);
  const [variants, setVariants] = useState<CatalogueProduct[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [slot, setSlot] = useState(1);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    setLoading(true);
    setError(null);
    setSlot(1);
    setQuantity(1);
    setVariants([]);
    void request<{ product: CatalogueProduct; variants: CatalogueProduct[] }>(
      `/products/${encodeURIComponent(id)}`,
    ).then(
      (result) => {
        if (!live) return;
        setProduct(result.product);
        setVariants(result.variants);
        setLoading(false);
      },
      (reason: Error) => {
        if (!live) return;
        setProduct(null);
        setVariants([]);
        setError(reason);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [id, attempt]);

  useEffect(() => {
    if (!product) return;
    void request<CatalogueResult>(
      `/products?brand=${encodeURIComponent(product.brand)}&limit=5&sort=popular`,
    ).then(
      (result) => setRelated(result.items.filter((item) => item.id !== product.id).slice(0, 4)),
      () => setRelated([]),
    );
  }, [product]);

  if (loading) return <PageLoading label="Loading product details…" />;
  if (error && (error as { status?: number }).status !== 404)
    return (
      <div className="container page">
        <ErrorPanel error={error} retry={() => setAttempt((value) => value + 1)} />
      </div>
    );
  if (!product)
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

  const images = [...product.images].sort((a, b) => a.slot - b.slot);
  const current = images.find((image) => image.slot === slot) || images[0];
  const team = !!user && user.role !== 'customer';
  const saved = wishlist.ids.has(product.id);
  const reminded = wishlist.restockAlerts.has(product.id);
  function move(delta: number) {
    if (!images.length) return;
    const index = images.findIndex((image) => image.slot === current?.slot);
    setSlot(images[(index + delta + images.length) % images.length].slot);
  }
  const facts = [
    ['Brand', product.brand],
    ['Series', product.series],
    ['Scale', product.scale],
    ['Condition', product.condition],
    ['Year of manufacture', product.manufactureYear ? String(product.manufactureYear) : ''],
    ['Product code', product.sku],
  ] as const;

  return (
    <div className="container page">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight size={13} />
        <Link to="/shop">Collection</Link>
        <ChevronRight size={13} />
        <Link to={`/shop?brand=${encodeURIComponent(product.brand)}`}>{product.brand}</Link>
      </div>
      <div className="product-detail">
        <div>
          <button
            className="detail-image"
            aria-label={
              current ? `Zoom ${current.alt || product.name}` : 'Product photo coming soon'
            }
            disabled={!current}
            onClick={() => setZoom(true)}
          >
            <Photo url={current?.url} alt={current?.alt || `${product.name} diecast model`} eager />
            {product.rare && <span className="rare-badge">✦ RARE FIND</span>}
            {current && (
              <span className="zoom-hint">
                <ZoomIn size={18} /> Tap for a closer look
              </span>
            )}
          </button>
          <div
            className="gallery-thumbs"
            role="group"
            aria-label="Product views. Use the arrow keys to move between views."
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                move(event.key === 'ArrowRight' ? 1 : -1);
              }
            }}
          >
            {viewNames.map((name, index) => {
              const image = images.find((item) => item.slot === index + 1);
              return (
                <button
                  key={name}
                  disabled={!image}
                  className={image && current?.slot === image.slot ? 'active' : ''}
                  aria-label={
                    image ? `Show ${name.toLowerCase()} view` : `${name} view coming soon`
                  }
                  aria-pressed={!!image && current?.slot === image.slot}
                  onClick={() => image && setSlot(image.slot)}
                >
                  <Photo url={image?.url} alt="" />
                </button>
              );
            })}
            <p>
              {images.length >= 5
                ? 'Five views of this model.'
                : `${images.length} of 5 views available.`}
              <br />
              {images.some((image) => image.url.includes('/samples/'))
                ? 'Sample photos until the final shoot.'
                : 'Colours may vary slightly on screen.'}
            </p>
          </div>
        </div>
        <div className="product-description">
          <span className="eyebrow red">
            {product.brand}
            {product.series && ` / ${product.series}`}
          </span>
          <h1>{product.name}</h1>
          <div className="detail-tags">
            {product.scale && <span>{product.scale} SCALE</span>}
            <span>{product.condition}</span>
            <span>{product.sku}</span>
          </div>
          <p className="detail-copy">
            {product.description || 'Full product details are being prepared.'}
          </p>
          {variants.length > 1 && (
            <div className="detail-variants">
              <h3>CHOOSE A VARIATION</h3>
              <div role="list" aria-label={`Variations of ${product.name}`}>
                {variants.map((variant) => (
                  <Link
                    role="listitem"
                    key={variant.id}
                    to={`/product/${variant.id}`}
                    className={variant.id === product.id ? 'active' : ''}
                    aria-current={variant.id === product.id ? 'true' : undefined}
                  >
                    <span>{variant.variantLabel || variant.sku}</span>
                    <small>
                      {money(variant.pricePaise)} · {variant.available ? 'In stock' : 'Sold out'}
                    </small>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="detail-price">
            <strong>{money(product.pricePaise)}</strong>
            {product.mrpPaise > product.pricePaise && (
              <>
                <del>{money(product.mrpPaise)}</del>
                <span>Save {money(product.mrpPaise - product.pricePaise)}</span>
              </>
            )}
          </div>
          <small className="muted">Price shown in INR</small>
          <p className={`detail-stock ${isLowStock(product) || !product.available ? 'low' : ''}`}>
            {product.available
              ? `● ${isLowStock(product) ? `Only ${product.available} left. This one's a keeper.` : 'In stock & ready for your shelf.'}`
              : '● Sold out. The hunt isn’t over.'}
          </p>
          {product.offer && (
            <div className="detail-offer">
              {product.offer}: this model is part of a current offer.{' '}
              <Link to={`/shop?offer=${encodeURIComponent(product.offer)}`}>
                Explore eligible models <ArrowRight size={14} />
              </Link>
            </div>
          )}
          {!team && (
            <div className="detail-buy">
              {product.available > 0 ? (
                <>
                  <Quantity
                    value={quantity}
                    max={product.available}
                    onChange={setQuantity}
                    label={`quantity of ${product.name}`}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={(event) => add(product, quantity, event.currentTarget)}
                  >
                    <ShoppingBag size={18} /> Add to your garage
                  </button>
                  <button
                    className="btn"
                    onClick={(event) => {
                      if (add(product, quantity, event.currentTarget))
                        navigate(user ? '/checkout' : '/account/login?next=%2Fcheckout');
                    }}
                  >
                    Buy now
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={reminded}
                  onClick={() => void wishlist.notifyMe(product)}
                >
                  <Bell size={18} />
                  {reminded ? 'Reminder saved' : 'Notify me when it returns'}
                </button>
              )}
              <button
                className={`icon-btn bordered ${saved ? 'red' : ''}`}
                aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
                aria-pressed={saved}
                onClick={() => void wishlist.toggle(product)}
              >
                <Heart size={20} fill={saved ? 'currentColor' : 'none'} />
              </button>
            </div>
          )}
          {!config?.commerce.checkoutEnabled && !team && (
            <div className="notice payment-soon">
              <ShieldCheck size={18} />
              <span>
                Online payment opens soon. You can already build your garage; secure Razorpay
                checkout switches on once the shop's payment account is verified.
              </span>
            </div>
          )}
          {config?.commerce.paymentMode === 'test' && !team && (
            <div className="notice payment-soon">
              <ShieldCheck size={18} />
              <span>
                Local test checkout is active. It creates a real local order but never charges money
                or contacts Razorpay.
              </span>
            </div>
          )}
          <DeliveryCheck product={product} quantity={quantity} />
          <dl className="product-facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || 'Not provided'}</dd>
              </div>
            ))}
          </dl>
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
      {related.length > 0 && (
        <section className="related-section">
          <div className="section-top">
            <div>
              <span className="eyebrow red">GOOD COMPANY FOR YOUR SHELF</span>
              <h2>
                KEEP THE <em>HUNT ALIVE.</em>
              </h2>
            </div>
            <Link className="text-link" to={`/shop?brand=${encodeURIComponent(product.brand)}`}>
              More from {product.brand} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
      {zoom && current && (
        <Modal title={product.name} onClose={() => setZoom(false)} className="zoom-modal">
          <div className="zoom-scroll">
            <Photo url={current.url} alt={current.alt || `${product.name} close-up`} eager />
          </div>
          {images.length > 1 && (
            <div className="zoom-controls">
              <button className="btn btn-small" onClick={() => move(-1)} aria-label="Previous view">
                <ArrowLeft size={18} />
              </button>
              <span>
                {viewNames[(current.slot || 1) - 1]} ·{' '}
                {images.findIndex((image) => image.slot === current.slot) + 1} / {images.length}
              </span>
              <button className="btn btn-small" onClick={() => move(1)} aria-label="Next view">
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function DeliveryCheck({ product, quantity }: { product: CatalogueProduct; quantity: number }) {
  const { user, csrfToken } = useSession();
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  if (user && user.role !== 'customer') return null;
  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setFailure('');
    try {
      const result = await mutate<{ shippingPaise: number }>(
        '/shipping/quote',
        {
          items: [
            {
              productId: product.id,
              quantity: Math.max(1, Math.min(quantity, product.available || 1)),
            },
          ],
          postalCode: pin,
        },
        csrfToken,
      );
      setMessage(
        result.shippingPaise === 0
          ? `Free delivery to ${pin}. Dispatched within 48 hours.`
          : `Delivery to ${pin}: ${money(result.shippingPaise)}. Dispatched within 48 hours.`,
      );
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="delivery-check">
      <h3>
        <Truck size={19} /> WILL IT REACH YOUR GARAGE?
      </h3>
      {user ? (
        <form onSubmit={check}>
          <input
            aria-label="Delivery PIN code"
            inputMode="numeric"
            maxLength={6}
            pattern="[1-9][0-9]{5}"
            title="Six-digit Indian PIN code"
            required
            placeholder="Enter your PIN code"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          />
          <button className="btn btn-small" disabled={busy}>
            {busy ? 'Checking…' : 'Check'} <ArrowRight size={15} />
          </button>
        </form>
      ) : (
        <p>
          <Link
            className="text-link"
            to={`/account/login?next=${encodeURIComponent(`/product/${product.id}`)}`}
          >
            Sign in
          </Link>{' '}
          to check the delivery charge to your PIN code.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {failure && (
        <p role="alert" className="form-error">
          {failure}
        </p>
      )}
    </div>
  );
}
