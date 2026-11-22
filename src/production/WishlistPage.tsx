import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useWishlist } from './wishlistStore';
import { useSession } from './session';
import { ProductCard } from './ProductCard';
import { Empty, PageLoading } from './ui';

export function WishlistPage() {
  const { user } = useSession();
  const wishlist = useWishlist();
  if (user && user.role !== 'customer')
    return (
      <div className="container page">
        <Empty
          title="Wishlists are for collectors"
          detail="Team accounts do not keep a wishlist."
        />
      </div>
    );
  if (wishlist.loading && !wishlist.items.length)
    return <PageLoading label="Loading your wishlist…" />;
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow red">THE ONES THAT CAUGHT YOUR EYE</span>
        <h1>YOUR GRAIL LIST.</h1>
        <p>Good taste. Save it today, add it to your shelf tomorrow.</p>
      </div>
      {wishlist.items.length ? (
        <div className="product-grid">
          {wishlist.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <Empty
          title="What's on your wish list?"
          detail="Tap the heart on a collectible to save it here."
        >
          <Link to="/shop" className="btn btn-primary">
            Find your next grail <ArrowRight size={16} />
          </Link>
        </Empty>
      )}
    </div>
  );
}
