import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { X, Check, AlertCircle, Plus, Minus, LoaderCircle } from 'lucide-react';
import { addToCart } from '../services/cart';
import type { OrderStatus } from '../types';
const Context = createContext({
  toast: (_message: string, _error?: boolean) => {},
  run: (_action: () => unknown, _message?: string): boolean => false,
  add: (_id: string, _quantity?: number, _element?: HTMLElement) => {},
  openCart: () => {},
  closeCart: () => {},
  cartOpen: false,
});
export const useUI = () => useContext(Context);
export function UIProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<{ id: number; message: string; error: boolean }[]>([]),
    [cartOpen, setCartOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function toast(message: string, error = false) {
    const id = Date.now() + Math.random();
    setMessages((m) => [...m.slice(-2), { id, message, error }]);
    timers.current.push(setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 4000));
  }
  function run(action: () => unknown, message?: string) {
    try {
      action();
      if (message) toast(message);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong in the demo.', true);
      return false;
    }
  }
  function add(id: string, quantity = 1, element?: HTMLElement) {
    if (run(() => addToCart(id, quantity), 'Added to your garage')) {
      const target = document.querySelector('[data-cart]');
      if (element && target) {
        const start = element.getBoundingClientRect(),
          end = target.getBoundingClientRect();
        const dot = document.createElement('span');
        dot.className = 'cart-fly';
        document.body.appendChild(dot);
        dot.animate(
          [
            {
              transform: `translate(${start.left + start.width / 2}px, ${start.top}px) scale(1)`,
              opacity: 1,
            },
            {
              transform: `translate(${end.left + end.width / 2}px, ${end.top + end.height / 2}px) scale(.35)`,
              opacity: 0,
            },
          ],
          { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' },
        ).onfinish = () => dot.remove();
      }
    }
  }
  return (
    <Context.Provider
      value={{
        toast,
        run,
        add,
        openCart: () => setCartOpen(true),
        closeCart: () => setCartOpen(false),
        cartOpen,
      }}
    >
      {children}
      <div className="toasts" aria-live="polite">
        {messages.map((m) => (
          <div className={`toast ${m.error ? 'error' : ''}`} key={m.id}>
            {m.error ? <AlertCircle size={18} /> : <Check size={18} />}
            <span>{m.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setMessages((x) => x.filter((t) => t.id !== m.id))}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const focusable = ref.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]',
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Badge({ status }: { status: OrderStatus | string }) {
  return (
    <span className={`badge status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
  );
}
export function Quantity({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="quantity">
      <button
        aria-label="Decrease quantity"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={14} />
      </button>
      <span>{value}</span>
      <button
        aria-label="Increase quantity"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
export function Empty({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">↗</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="container page-loading" aria-label="Loading" role="status">
      <LoaderCircle className="spin" />
      <div className="skeleton skeleton-title" />
      <div className="product-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton skeleton-card" key={i} />
        ))}
      </div>
    </div>
  );
}
export function ImageUpload({
  onChange,
  label = 'Upload image',
}: {
  onChange: (image: string) => void;
  label?: string;
}) {
  const { toast } = useUI();
  return (
    <label className="upload-label">
      {label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (
            !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) ||
            f.size > 2 * 1024 * 1024
          ) {
            toast('Choose a PNG, JPG or WebP under 2 MB.', true);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const image = new Image();
            image.onload = () => {
              const canvas = document.createElement('canvas'),
                scale = Math.min(1, 600 / image.width, 600 / image.height);
              canvas.width = Math.round(image.width * scale);
              canvas.height = Math.round(image.height * scale);
              const ctx = canvas.getContext('2d');
              if (!ctx) return;
              ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
              onChange(canvas.toDataURL('image/webp', 0.8));
            };
            image.src = String(reader.result);
          };
          reader.readAsDataURL(f);
        }}
      />
    </label>
  );
}
