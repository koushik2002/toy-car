// The demo's interaction kit (toasts, modal, badge, quantity, empty states) for the live app.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, ImageOff, LoaderCircle, Minus, Plus, X } from 'lucide-react';
import { imageUrl, statusLabel } from './api';

const Context = createContext({
  toast: (_message: string, _error?: boolean) => {},
  /** Runs an async action, shows its error as a toast, and reports whether it succeeded. */
  run: async (_action: () => Promise<unknown>, _message?: string): Promise<boolean> => false,
  /** Animates a dot from the clicked element into the header cart. */
  fly: (_element?: HTMLElement | null) => {},
  openCart: () => {},
  closeCart: () => {},
  cartOpen: false,
});
export const useUI = () => useContext(Context);

export function UIProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<{ id: number; message: string; error: boolean }[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function toast(message: string, error = false) {
    const id = Date.now() + Math.random();
    setMessages((current) => [...current.slice(-2), { id, message, error }]);
    timers.current.push(
      setTimeout(() => setMessages((current) => current.filter((m) => m.id !== id)), 4500),
    );
  }
  async function run(action: () => Promise<unknown>, message?: string) {
    try {
      await action();
      if (message) toast(message);
      return true;
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        true,
      );
      return false;
    }
  }
  function fly(element?: HTMLElement | null) {
    const target = document.querySelector('[data-cart]');
    if (!element || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const start = element.getBoundingClientRect();
    const end = target.getBoundingClientRect();
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
  return (
    <Context.Provider
      value={{
        toast,
        run,
        fly,
        openCart: () => setCartOpen(true),
        closeCart: () => setCartOpen(false),
        cartOpen,
      }}
    >
      {children}
      <div className="toasts" aria-live="polite">
        {messages.map((m) => (
          <div
            className={`toast ${m.error ? 'error' : ''}`}
            key={m.id}
            role={m.error ? 'alert' : 'status'}
          >
            {m.error ? <AlertCircle size={18} /> : <Check size={18} />}
            <span>{m.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setMessages((current) => current.filter((t) => t.id !== m.id))}
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
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const focusable = ref.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === ref.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', key);
      // If the button that opened the dialog has gone (e.g. "Cancel order"), keep focus in the page.
      if (previous?.isConnected) previous.focus();
      else document.getElementById('main-content')?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
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

// Maps live order states onto the demo's badge colours.
const badgeTone: Record<string, string> = {
  pending_payment: 'pending',
  paid: 'confirmed',
  processing: 'packed',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  refund_pending: 'return-requested',
  refunded: 'refunded',
  open: 'pending',
  approved: 'delivered',
  rejected: 'cancelled',
  sent: 'success',
  failed: 'failed',
  pending: 'pending',
  processing_job: 'shipped',
  live: 'success',
  draft: 'pending',
};
export function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`badge status-${badgeTone[status] || status}`}>
      {label ?? statusLabel(status)}
    </span>
  );
}

export function Quantity({
  value,
  max,
  onChange,
  label = 'quantity',
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
}) {
  return (
    <div className="quantity">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={14} />
      </button>
      <span aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
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
      <span className="empty-symbol" aria-hidden="true">
        ↗
      </span>
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
      {children}
    </div>
  );
}

export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="container page-loading" aria-label={label} role="status">
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

export function ErrorPanel({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <Empty title="We couldn’t load that just yet." detail={error.message}>
      {retry && (
        <button className="btn btn-primary" onClick={retry}>
          Try again
        </button>
      )}
    </Empty>
  );
}

/** Product photo with a graceful "photo coming soon" state for missing or broken images. */
export function Photo({
  url,
  alt,
  eager = false,
  className = '',
  sizes,
}: {
  url?: string | null;
  alt: string;
  eager?: boolean;
  className?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState('');
  const source = imageUrl(url);
  if (!source || failed === source)
    return (
      <div
        className={`photo-missing ${className}`}
        role="img"
        aria-label={`${alt} — photo coming soon`}
      >
        <ImageOff size={28} aria-hidden="true" />
        <span>Photo coming soon</span>
      </div>
    );
  return (
    <img
      className={className}
      src={source}
      alt={alt}
      sizes={sizes}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(source)}
    />
  );
}
