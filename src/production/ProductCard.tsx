import { Link } from 'react-router-dom';
import { ArrowUpRight, Heart, Plus } from 'lucide-react';
import { money, type CatalogueProduct } from './api';
import { useSession } from './session';
import { useCart } from './cart';
import { useWishlist } from './wishlistStore';
import { Photo, useUI } from './ui';

const thirtyDays = 30 * 86400000;
export const isNewDrop = (product: CatalogueProduct) =>
  Date.now() - new Date(product.createdAt).getTime() <= thirtyDays;
export const isLowStock = (product: CatalogueProduct) =>
  product.available > 0 && product.available <= product.lowStockThreshold;

/** Adds to the cart with the demo's fly-to-cart feedback; guests are sent to sign in first. */
export function useAddToCart() {
  const cart = useCart();
  const ui = useUI();
  const { user } = useSession();
  return (product: CatalogueProduct, quantity = 1, element?: HTMLElement | null) => {
    if (user && user.role !== 'customer') {
      ui.toast('Team accounts cannot place customer orders.', true);
      return false;
    }
    try {
      cart.add(product, quantity);
    } catch (error) {
      ui.toast((error as Error).message, true);
      return false;
    }
    ui.fly(element);
    ui.toast(
      user ? 'Added to your garage' : 'Added to your garage. Sign in when you are ready to pay.',
    );
    return true;
  };
}

export function ProductCard({ product }: { product: CatalogueProduct }) {
  const { user } = useSession();
  const wishlist = useWishlist();
  const add = useAddToCart();
  const team = !!user && user.role !== 'customer';
  const saved = wishlist.ids.has(product.id);
  const photo = product.images[0];
  return (
    <article className={`product-card ${!product.available ? 'sold-out' : ''}`}>
      <div className="product-image">
        <Link to={`/product/${product.id}`} aria-label={`View ${product.name}`}>
          <Photo url={photo?.url} alt={`${product.brand} ${product.name} miniature model`} />
        </Link>
        <div className="card-badges">
          {product.rare ? (
            <span className="rare-badge">✦ RARE FIND</span>
          ) : isNewDrop(product) ? (
            <span className="new-badge">NEW DROP</span>
          ) : null}
          {product.condition !== 'New' && (
            <span className="condition-badge">{product.condition}</span>
          )}
        </div>
        {!team && (
          <button
            className={`wish-btn ${saved ? 'active' : ''}`}
            aria-label={`${saved ? 'Remove' : 'Add'} ${product.name} ${saved ? 'from' : 'to'} wishlist`}
            aria-pressed={saved}
            onClick={() => void wishlist.toggle(product)}
          >
            <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      <div className="product-info">
        <div className="product-meta">
          <span>{product.brand}</span>
          <span>{product.scale}</span>
        </div>
        <Link className="product-name" to={`/product/${product.id}`}>
          {product.name}
        </Link>
        <p className="product-series">
          {product.series} <span>·</span> {product.condition}
        </p>
        <div className="product-bottom">
          <div>
            <strong>{money(product.pricePaise)}</strong>{' '}
            {product.mrpPaise > product.pricePaise && <del>{money(product.mrpPaise)}</del>}
            <p className={`stock-note ${isLowStock(product) ? 'low' : ''}`}>
              {!product.available
                ? 'Sold out'
                : isLowStock(product)
                  ? `● Only ${product.available} left`
                  : '● In stock'}
            </p>
          </div>
          {!team && (
            <button
              className="card-add"
              aria-label={`Add ${product.name} to cart`}
              disabled={!product.available}
              onClick={(event) => add(product, 1, event.currentTarget)}
            >
              <Plus size={21} />
            </button>
          )}
        </div>
        {product.offer && (
          <Link className="offer-note" to={`/shop?offer=${encodeURIComponent(product.offer)}`}>
            {product.offer} <ArrowUpRight size={12} />
          </Link>
        )}
      </div>
    </article>
  );
}
