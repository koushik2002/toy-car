import { Link } from 'react-router-dom';
import { Heart, Plus, ArrowUpRight } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { toggleWishlist } from '../services/cart';
import { money, asset } from '../services/format';
import { useUI } from './UI';
import type { Product } from '../types';
export default function ProductCard({ product: p }: { product: Product }) {
  const state = useStore(),
    ui = useUI(),
    offer = state.offers.find((o) => o.id === p.offer && o.enabled);
  return (
    <article className={`product-card ${!p.stock ? 'sold-out' : ''}`}>
      <div className="product-image">
        <Link to={`/product/${p.id}`} aria-label={`View ${p.name}`}>
          <img
            src={asset(p.image)}
            srcSet={
              p.image.startsWith('assets/products/')
                ? `${asset(p.image.replace('.webp', '-small.webp'))} 360w, ${asset(p.image)} 660w`
                : undefined
            }
            sizes="(max-width: 640px) 45vw, (max-width: 850px) 42vw, 25vw"
            alt={`${p.brand} ${p.name} miniature model`}
            loading="lazy"
            width="420"
            height="300"
          />
        </Link>
        <div className="card-badges">
          {p.rare ? (
            <span className="rare-badge">✦ RARE FIND</span>
          ) : p.arrival >= 55 ? (
            <span className="new-badge">NEW DROP</span>
          ) : null}
          {p.condition !== 'New' && <span className="condition-badge">{p.condition}</span>}
        </div>
        <button
          className={`wish-btn ${state.wishlist.includes(p.id) ? 'active' : ''}`}
          aria-label={`${state.wishlist.includes(p.id) ? 'Remove' : 'Add'} ${p.name} ${state.wishlist.includes(p.id) ? 'from' : 'to'} wishlist`}
          onClick={() =>
            ui.run(
              () => toggleWishlist(p.id),
              state.wishlist.includes(p.id) ? 'Removed from wishlist' : 'Saved to wishlist',
            )
          }
        >
          <Heart size={18} fill={state.wishlist.includes(p.id) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="product-info">
        <div className="product-meta">
          <span>{p.brand}</span>
          <span>{p.scale}</span>
        </div>
        <Link className="product-name" to={`/product/${p.id}`}>
          {p.name}
        </Link>
        <p className="product-series">
          {p.series} <span>·</span> {p.condition}
        </p>
        <div className="product-bottom">
          <div>
            <strong>{money(p.price)}</strong> <del>{money(p.mrp)}</del>
            <p className={`stock-note ${p.stock <= p.threshold ? 'low' : ''}`}>
              {!p.stock
                ? 'Sold out'
                : p.stock <= p.threshold
                  ? `● Only ${p.stock} left`
                  : '● In stock'}
            </p>
          </div>
          <button
            className="card-add"
            aria-label={`Add ${p.name} to cart`}
            disabled={!p.stock}
            onClick={(e) => ui.add(p.id, 1, e.currentTarget)}
          >
            <Plus size={21} />
          </button>
        </div>
        {offer && (
          <Link className="offer-note" to={`/shop?offer=${offer.id}`}>
            {offer.name} <ArrowUpRight size={12} />
          </Link>
        )}
      </div>
    </article>
  );
}
