import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { request, send, type CatalogueProduct } from './api';
import { useSession } from './session';
import { useUI } from './ui';

type WishlistState = {
  ids: Set<string>;
  items: CatalogueProduct[];
  restockAlerts: Set<string>;
  loading: boolean;
  toggle: (product: CatalogueProduct) => Promise<void>;
  notifyMe: (product: CatalogueProduct) => Promise<void>;
  reload: () => void;
};

const Context = createContext<WishlistState>({
  ids: new Set(),
  items: [],
  restockAlerts: new Set(),
  loading: false,
  toggle: async () => {},
  notifyMe: async () => {},
  reload: () => {},
});
export const useWishlist = () => useContext(Context);

/** Server-saved wishlist and back-in-stock requests. Guests are sent to sign in first. */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, csrfToken } = useSession();
  const ui = useUI();
  const navigate = useNavigate();
  const [items, setItems] = useState<CatalogueProduct[]>([]);
  const [restockAlerts, setRestockAlerts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const customer = user?.role === 'customer';

  const reload = useCallback(() => {
    if (!customer) {
      setItems([]);
      setRestockAlerts(new Set());
      return;
    }
    setLoading(true);
    void request<{ items: CatalogueProduct[]; restockAlerts: string[] }>('/wishlist')
      .then(
        (result) => {
          setItems(result.items);
          setRestockAlerts(new Set(result.restockAlerts));
        },
        () => {},
      )
      .finally(() => setLoading(false));
  }, [customer]);
  useEffect(reload, [reload, user?.id]);

  function requireCustomer() {
    if (customer) return true;
    if (!user)
      navigate(`/account/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    else ui.toast('Wishlists are for customer accounts.', true);
    return false;
  }

  async function toggle(product: CatalogueProduct) {
    if (!requireCustomer()) return;
    const saved = items.some((item) => item.id === product.id);
    // Optimistic: the heart changes at once and reverts if the server refuses.
    setItems((current) =>
      saved ? current.filter((item) => item.id !== product.id) : [product, ...current],
    );
    const ok = await ui.run(
      () => send(saved ? 'DELETE' : 'PUT', `/wishlist/${product.id}`, undefined, csrfToken),
      saved ? 'Removed from your wishlist' : 'Saved to your wishlist',
    );
    if (!ok) reload();
  }

  async function notifyMe(product: CatalogueProduct) {
    if (!requireCustomer()) return;
    if (
      await ui.run(
        () => send('PUT', `/restock-alerts/${product.id}`, undefined, csrfToken),
        'We’ll let you know when it’s back.',
      )
    )
      setRestockAlerts((current) => new Set(current).add(product.id));
  }

  return (
    <Context.Provider
      value={{
        ids: new Set(items.map((item) => item.id)),
        items,
        restockAlerts,
        loading,
        toggle,
        notifyMe,
        reload,
      }}
    >
      {children}
    </Context.Provider>
  );
}
