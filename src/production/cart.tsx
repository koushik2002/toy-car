import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { request, type CatalogueOverview, type CatalogueProduct } from './api';
import { useSession } from './session';

export type CartLine = { product: CatalogueProduct; quantity: number };
type Stored = { productId: string; quantity: number; product: CatalogueProduct };

type CartState = {
  lines: CartLine[];
  count: number;
  subtotalPaise: number;
  /** Active free-delivery threshold, or null when the shop has none. */
  freeShippingAbovePaise: number | null;
  shippingBasePaise: number | null;
  add: (product: CatalogueProduct, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const Context = createContext<CartState>({
  lines: [],
  count: 0,
  subtotalPaise: 0,
  freeShippingAbovePaise: null,
  shippingBasePaise: null,
  add: () => {},
  setQuantity: () => {},
  remove: () => {},
  clear: () => {},
});
export const useCart = () => useContext(Context);

const maxLines = 20; // Checkout accepts at most 20 different products per order.
const storageKey = (owner: string) => `tinykars-cart:${owner}`;

function readStored(owner: string): Stored[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(owner)) || '[]') as Stored[];
    return Array.isArray(value)
      ? value.filter((line) => line?.product?.id && line.quantity > 0)
      : [];
  } catch {
    return [];
  }
}

/** Browser-kept cart. A guest cart is carried into the account when the shopper signs in. */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading, config } = useSession();
  const owner = user?.role === 'customer' ? user.id : 'guest';
  const [lines, setLines] = useState<Stored[]>([]);
  const [freeAbove, setFreeAbove] = useState<number | null>(null);
  const [shippingBase, setShippingBase] = useState<number | null>(null);
  const latest = useRef(lines);
  latest.current = lines;

  useEffect(() => {
    if (loading) return;
    let next = readStored(owner);
    if (owner !== 'guest') {
      const guest = readStored('guest');
      for (const line of guest)
        if (!next.some((item) => item.productId === line.productId)) next.push(line);
      next = next.slice(0, maxLines);
      try {
        localStorage.removeItem(storageKey('guest'));
      } catch {
        /* Storage can be unavailable in private windows; the cart still works for this visit. */
      }
    }
    setLines(next);
    if (!next.length) return;
    // Refresh prices and stock; anything withdrawn from sale drops out of the cart.
    void Promise.all(
      next.map((line) =>
        request<{ product: CatalogueProduct }>(`/products/${line.productId}`).then(
          (result) => result.product,
          () => null,
        ),
      ),
    ).then((products) =>
      setLines((current) =>
        current.flatMap((line) => {
          const index = next.findIndex((item) => item.productId === line.productId);
          if (index < 0) return [line];
          const fresh = products[index];
          if (!fresh) return [];
          return [
            {
              ...line,
              product: fresh,
              quantity: Math.min(line.quantity, Math.max(1, fresh.available)),
            },
          ];
        }),
      ),
    );
  }, [owner, loading]);

  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(storageKey(owner), JSON.stringify(lines));
    } catch {
      /* Ignore: storage unavailable. */
    }
  }, [lines, owner, loading]);

  useEffect(() => {
    if (loading) return;
    if (!user && !config?.catalogue.publicBrowsing) {
      setFreeAbove(null);
      setShippingBase(null);
      return;
    }
    void request<CatalogueOverview>('/products/overview').then(
      (overview) => {
        setFreeAbove(overview.shipping?.freeAbovePaise ?? null);
        setShippingBase(overview.shipping?.basePaise ?? null);
      },
      () => {
        setFreeAbove(null);
        setShippingBase(null);
      },
    );
  }, [config?.catalogue.publicBrowsing, loading, user]);

  /** Throws a shopper-readable error when the line cannot be added; callers show it as a toast. */
  const add = useCallback((product: CatalogueProduct, quantity = 1) => {
    const current = latest.current;
    const existing = current.find((line) => line.productId === product.id);
    const wanted = (existing?.quantity ?? 0) + quantity;
    if (product.available < 1) throw new Error(`${product.name} is sold out.`);
    if (wanted > product.available)
      throw new Error(`Only ${product.available} of ${product.name} available.`);
    if (!existing && current.length >= maxLines)
      throw new Error(`An order can hold up to ${maxLines} different models.`);
    const next = existing
      ? current.map((line) =>
          line.productId === product.id ? { ...line, product, quantity: wanted } : line,
        )
      : [...current, { productId: product.id, quantity, product }];
    latest.current = next;
    setLines(next);
  }, []);
  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((current) =>
      quantity < 1
        ? current.filter((line) => line.productId !== productId)
        : current.map((line) =>
            line.productId === productId
              ? { ...line, quantity: Math.min(quantity, line.product.available) }
              : line,
          ),
    );
  }, []);
  const remove = useCallback(
    (productId: string) =>
      setLines((current) => current.filter((line) => line.productId !== productId)),
    [],
  );
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartState>(() => {
    const view = lines.map((line) => ({ product: line.product, quantity: line.quantity }));
    return {
      lines: view,
      count: view.reduce((sum, line) => sum + line.quantity, 0),
      subtotalPaise: view.reduce((sum, line) => sum + line.product.pricePaise * line.quantity, 0),
      freeShippingAbovePaise: freeAbove,
      shippingBasePaise: shippingBase,
      add,
      setQuantity,
      remove,
      clear,
    };
  }, [lines, freeAbove, shippingBase, add, setQuantity, remove, clear]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
