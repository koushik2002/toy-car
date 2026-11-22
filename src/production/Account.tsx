import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Gift,
  Heart,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Plus,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import {
  date,
  money,
  request,
  send,
  statusLabel,
  type AccountUser,
  type Address,
  type AddressInput,
  type OrderSummary,
} from './api';
import { useSession } from './session';
import { Badge, Empty, ErrorPanel, Modal, PageLoading, Photo, useUI } from './ui';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

function teamHome(user: AccountUser) {
  if (user.role === 'seller') return '/admin/billing';
  if (user.role === 'staff') return '/admin/orders';
  return '/admin';
}

/** Small loader for one GET resource with a manual reload. */
function useLoad<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({
    loading: !!path,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((previous) => ({ ...previous, loading: true, error: undefined }));
    void request<T>(path).then(
      (data) => live && setState({ data, loading: false }),
      (error: Error) => live && setState({ error, loading: false }),
    );
    return () => {
      live = false;
    };
  }, [path, attempt]);
  return { ...state, reload: () => setAttempt((value) => value + 1) };
}

function FormMessage({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="form-message success" role="status">
          {success}
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sign in, create account, reset password, verify email               */
/* ------------------------------------------------------------------ */

type Mode = 'register' | 'login' | 'forgot' | 'reset' | 'verify';
const headings: Record<Mode, { eyebrow: string; title: string; intro: string }> = {
  login: {
    eyebrow: 'YOUR COLLECTION. YOUR CORNER.',
    title: 'WELCOME TO THE GARAGE.',
    intro: 'Sign in to browse the collection, track your orders and check out securely.',
  },
  register: {
    eyebrow: 'NEW COLLECTOR?',
    title: 'JOIN THE GARAGE.',
    intro: 'Create your account. We’ll email you a link to confirm your address.',
  },
  forgot: {
    eyebrow: 'IT HAPPENS TO EVERY COLLECTOR',
    title: 'FORGOT YOUR PASSWORD?',
    intro: 'Enter your email address. If it has an account, we’ll send a reset link.',
  },
  reset: {
    eyebrow: 'ALMOST THERE',
    title: 'CHOOSE A NEW PASSWORD.',
    intro: 'Use at least 12 characters. A short phrase is easy to remember and hard to guess.',
  },
  verify: {
    eyebrow: 'ONE LAST STEP',
    title: 'CONFIRM YOUR EMAIL.',
    intro: 'Tap the button below to finish setting up your account.',
  },
};

// Same-site paths only, and never back to a sign-in page (that would loop).
function safeNext(next: string | null) {
  return next?.startsWith('/') &&
    !next.startsWith('//') &&
    !next.includes('\\') &&
    !/^\/account\/(login|register|forgot|reset|verify)\b/.test(next)
    ? next
    : null;
}

export function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const session = useSession();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [success, setSuccess] = useState('');
  const [token, setToken] = useState('');
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    setFailure('');
    setSuccess('');
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    setToken(hash.get('token') || '');
    // The secure code must not stay in the address bar or browser history.
    if (hash.has('token')) history.replaceState(null, '', window.location.pathname);
  }, [mode]);

  // Navigate only once the shared session has picked up the new sign-in, so guarded pages
  // never see a stale signed-out state.
  useEffect(() => {
    if (destination && session.user && !session.loading) navigate(destination, { replace: true });
  }, [destination, session.user, session.loading, navigate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '')
      .trim()
      .toLowerCase();
    const password = String(form.get('password') || '');
    if (
      (mode === 'register' || mode === 'reset') &&
      password !== String(form.get('confirm') || '')
    ) {
      setFailure('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const result = await send<{ user: AccountUser | null }>('POST', '/auth/login', {
          email,
          password,
        });
        if (result.user) {
          const user = result.user;
          setDestination(
            safeNext(params.get('next')) || (user.role === 'customer' ? '/shop' : teamHome(user)),
          );
          session.reload();
        }
      } else if (mode === 'register') {
        const result = await send<{ message: string }>('POST', '/auth/register', {
          name: String(form.get('name') || '').trim(),
          email,
          password,
        });
        setSuccess(result.message);
      } else if (mode === 'forgot') {
        const result = await send<{ message: string }>('POST', '/auth/forgot-password', { email });
        setSuccess(result.message);
      } else if (mode === 'reset') {
        const result = await send<{ message: string }>('POST', '/auth/reset-password', {
          token,
          password,
        });
        setSuccess(result.message);
        setToken('');
      } else {
        const result = await send<{ message: string }>('POST', '/auth/verify-email', { token });
        setSuccess(result.message);
        setToken('');
      }
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const needsToken = mode === 'reset' || mode === 'verify';
  const text = headings[mode];
  const signedInAlready = mode === 'login' && session.user && !destination;
  return (
    <div className="container page login-page">
      <div className="login-panel auth-panel">
        <span className="eyebrow red">{text.eyebrow}</span>
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
        {signedInAlready ? (
          <div className="notice">
            <UserRound size={18} />
            <span>
              You are signed in as <b>{session.user!.name}</b>.{' '}
              <Link
                className="text-link"
                to={session.user!.role === 'customer' ? '/account' : teamHome(session.user!)}
              >
                Continue <ArrowRight size={14} />
              </Link>
            </span>
          </div>
        ) : (
          <>
            <FormMessage error={failure} success={success} />
            {(!needsToken || token) && !success && (
              <form onSubmit={submit} className="auth-form" noValidate={false}>
                {mode === 'register' && (
                  <label>
                    Your name
                    <input name="name" autoComplete="name" required maxLength={100} />
                  </label>
                )}
                {['register', 'login', 'forgot'].includes(mode) && (
                  <label>
                    Email address
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      placeholder="you@example.com"
                    />
                  </label>
                )}
                {['register', 'login', 'reset'].includes(mode) && (
                  <label>
                    {mode === 'reset' ? 'New password' : 'Password'}
                    <input
                      name="password"
                      type="password"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      minLength={12}
                      maxLength={128}
                    />
                    {mode !== 'login' && <small>At least 12 characters.</small>}
                  </label>
                )}
                {['register', 'reset'].includes(mode) && (
                  <label>
                    Confirm password
                    <input
                      name="confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                    />
                  </label>
                )}
                <button className="btn btn-primary full" disabled={busy}>
                  {busy
                    ? 'Please wait…'
                    : {
                        register: 'Create account',
                        login: 'Sign in',
                        forgot: 'Email me a reset link',
                        reset: 'Save new password',
                        verify: 'Confirm my email',
                      }[mode]}
                  {!busy && <ArrowRight size={17} />}
                </button>
              </form>
            )}
            {needsToken && !token && !success && (
              <p className="form-message error" role="alert">
                This link is missing its secure code. Please request a new email.
              </p>
            )}
            {success && (mode === 'reset' || mode === 'verify') && (
              <Link className="btn btn-primary full" to="/account/login">
                Sign in <ArrowRight size={17} />
              </Link>
            )}
          </>
        )}
        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <Link to="/account/forgot">Forgot your password?</Link>
              <div className="or-divider">NEW HERE?</div>
              <Link className="btn full" to="/account/register">
                Create an account <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <Link to="/account/login">
                {mode === 'register' ? 'Already a collector? Sign in' : 'Back to sign in'}
              </Link>
              {mode === 'register' && (
                <Link to="/account/forgot">Didn’t get the email? Request a new link</Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Account area                                                       */
/* ------------------------------------------------------------------ */

type Tab = 'orders' | 'addresses' | 'profile' | 'rewards' | 'security';

export function AccountPage() {
  const { user, csrfToken, reload } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  if (!user) return <PageLoading label="Opening your account…" />;
  const customer = user.role === 'customer';
  const segment = location.pathname.split('/')[2] || '';
  const tab: Tab = (
    ['orders', 'addresses', 'profile', 'rewards', 'security'].includes(segment)
      ? segment
      : customer
        ? 'orders'
        : 'profile'
  ) as Tab;
  const allowed: Tab[] = customer
    ? ['orders', 'addresses', 'profile', 'rewards', 'security']
    : ['profile', 'security'];
  const current = allowed.includes(tab) ? tab : allowed[0];

  async function signOut() {
    setBusy(true);
    const ok = await ui.run(() => send('POST', '/auth/logout', {}, csrfToken), 'Signed out.');
    setBusy(false);
    if (ok) {
      reload();
      navigate('/', { replace: true });
    }
  }

  const link = (to: string, label: string, icon: ReactNode, active: boolean) => (
    <NavLink to={to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
      {icon} {label}
    </NavLink>
  );
  return (
    <div className="container page">
      <div className={`page-heading account-page-heading ${customer ? 'with-mascot' : ''}`}>
        <span className="eyebrow red">
          {customer ? 'THE COLLECTOR’S CORNER' : 'YOUR TEAM ACCOUNT'}
        </span>
        <h1>HEY, {user.name.split(' ')[0].toUpperCase()}.</h1>
        <p>
          {customer
            ? 'Your orders, your grails, your growing garage.'
            : 'Your profile and sign-in security.'}
        </p>
        {customer && (
          <img
            className="account-mascot"
            src={`${import.meta.env.BASE_URL}assets/brand/mascot.webp`}
            alt=""
            aria-hidden="true"
            width="720"
            height="1080"
            loading="lazy"
          />
        )}
      </div>
      <div className="account-layout">
        <aside className="account-nav" aria-label="Account sections">
          <div className="account-user">
            <span className="user-avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <div>
              <b>{user.name}</b>
              <small>{user.email}</small>
            </div>
          </div>
          {customer && (
            <>
              {link('/account/orders', 'My orders', <Package size={17} />, current === 'orders')}
              {link('/wishlist', 'Wishlist', <Heart size={17} />, false)}
              {link(
                '/account/addresses',
                'Saved addresses',
                <MapPin size={17} />,
                current === 'addresses',
              )}
            </>
          )}
          {link('/account/profile', 'Profile', <UserRound size={17} />, current === 'profile')}
          {customer &&
            link('/account/rewards', 'Rewards & credit', <Gift size={17} />, current === 'rewards')}
          {link('/account/security', 'Security', <ShieldCheck size={17} />, current === 'security')}
          {!customer && (
            <Link to={teamHome(user)}>
              <LayoutDashboard size={17} /> Control room
            </Link>
          )}
          <button onClick={signOut} disabled={busy}>
            <LogOut size={17} /> {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </aside>
        <section className="account-content">
          {current === 'orders' && <OrdersTab />}
          {current === 'addresses' && <AddressesTab csrfToken={csrfToken} />}
          {current === 'profile' && (
            <ProfileTab user={user} csrfToken={csrfToken} reload={reload} />
          )}
          {current === 'rewards' && <RewardsTab />}
          {current === 'security' && <SecurityTab csrfToken={csrfToken} />}
        </section>
      </div>
    </div>
  );
}

/* Orders ------------------------------------------------------------ */

const orderStatuses = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refund_pending',
  'refunded',
];

function OrdersTab() {
  const orders = useLoad<{ items: OrderSummary[] }>('/orders');
  const [status, setStatus] = useState('');
  const items = (orders.data?.items || []).filter((order) => !status || order.status === status);
  return (
    <>
      <div className="section-top">
        <h2>MY ORDERS</h2>
        <select
          aria-label="Filter my orders by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {orderStatuses.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
      </div>
      {orders.loading ? (
        <div className="account-skeleton" role="status" aria-label="Loading your orders">
          {[1, 2].map((key) => (
            <div className="skeleton order-skeleton" key={key} />
          ))}
        </div>
      ) : orders.error ? (
        <ErrorPanel error={orders.error} retry={orders.reload} />
      ) : items.length ? (
        items.map((order) => (
          <article className="order-card" key={order.id}>
            <div className="order-card-top">
              <div>
                <Link to={`/account/orders/${order.id}`}>
                  <b>{order.orderNumber}</b>
                </Link>
                <small>
                  Placed {date(order.createdAt)} · {order.itemCount}{' '}
                  {order.itemCount === 1 ? 'model' : 'models'}
                </small>
              </div>
              <Badge status={order.status} />
            </div>
            <div className="order-card-body">
              <div className="order-images">
                {order.previewImages.length ? (
                  order.previewImages
                    .slice(0, 3)
                    .map((url, index) => <Photo key={index} url={url} alt="" />)
                ) : (
                  <Photo url={null} alt={order.firstItemName} />
                )}
              </div>
              <div>
                <b>{order.firstItemName}</b>
                {order.itemCount > 1 && (
                  <small>
                    + {order.itemCount - 1} more {order.itemCount - 1 === 1 ? 'model' : 'models'}
                  </small>
                )}
                <strong>{money(order.totalPaise)}</strong>
                {order.latestRequest && (
                  <small className="request-note">
                    {order.latestRequest.kind === 'cancel' ? 'Cancellation' : 'Return'}{' '}
                    {order.latestRequest.status === 'open'
                      ? 'requested · being reviewed'
                      : order.latestRequest.status}
                  </small>
                )}
              </div>
              <Link className="btn btn-small" to={`/account/orders/${order.id}`}>
                View order <ArrowRight size={15} />
              </Link>
            </div>
          </article>
        ))
      ) : (
        <Empty
          title="Your next story starts here"
          detail={
            status ? 'No orders with this status.' : 'Your orders will appear here after checkout.'
          }
        >
          <Link className="btn btn-primary" to="/shop">
            Explore the collection
          </Link>
        </Empty>
      )}
    </>
  );
}

/* Addresses --------------------------------------------------------- */

const blankAddress: AddressInput = {
  recipientName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  isDefault: false,
};

export function AddressFields({
  value,
  onChange,
}: {
  value: AddressInput;
  onChange: (value: AddressInput) => void;
}) {
  const set = (key: keyof AddressInput, next: string) => onChange({ ...value, [key]: next });
  return (
    <div className="form-grid">
      <label>
        Full name
        <input
          autoComplete="name"
          required
          minLength={2}
          maxLength={120}
          value={value.recipientName}
          onChange={(event) => set('recipientName', event.target.value)}
        />
      </label>
      <label>
        Mobile number
        <input
          autoComplete="tel-national"
          inputMode="tel"
          maxLength={10}
          pattern="[6-9][0-9]{9}"
          title="A 10-digit Indian mobile number"
          required
          placeholder="10-digit mobile"
          value={value.phone}
          onChange={(event) => set('phone', event.target.value.replace(/\D/g, ''))}
        />
      </label>
      <label className="span-2">
        House number and street
        <input
          autoComplete="address-line1"
          required
          minLength={3}
          maxLength={200}
          value={value.line1}
          onChange={(event) => set('line1', event.target.value)}
        />
      </label>
      <label className="span-2">
        Apartment, area or landmark (optional)
        <input
          autoComplete="address-line2"
          maxLength={200}
          value={value.line2}
          onChange={(event) => set('line2', event.target.value)}
        />
      </label>
      <label>
        City
        <input
          autoComplete="address-level2"
          required
          minLength={2}
          maxLength={100}
          value={value.city}
          onChange={(event) => set('city', event.target.value)}
        />
      </label>
      <label>
        State
        <input
          autoComplete="address-level1"
          required
          minLength={2}
          maxLength={100}
          value={value.state}
          onChange={(event) => set('state', event.target.value)}
        />
      </label>
      <label>
        PIN code
        <input
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={6}
          pattern="[1-9][0-9]{5}"
          title="A 6-digit PIN code"
          required
          placeholder="6-digit PIN"
          value={value.postalCode}
          onChange={(event) => set('postalCode', event.target.value.replace(/\D/g, ''))}
        />
      </label>
    </div>
  );
}

function AddressesTab({ csrfToken }: { csrfToken: string | null }) {
  const ui = useUI();
  const addresses = useLoad<{ items: Address[] }>('/account/addresses');
  const [editing, setEditing] = useState<{ id?: string; value: AddressInput } | null>(null);
  const [removing, setRemoving] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const body = { ...editing.value, line2: editing.value.line2 || '' };
      if (editing.id) await send('PUT', `/account/addresses/${editing.id}`, body, csrfToken);
      else await send('POST', '/account/addresses', body, csrfToken);
      ui.toast('Address saved.');
      setEditing(null);
      addresses.reload();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const ok = await ui.run(
      () => send('DELETE', `/account/addresses/${removing.id}`, undefined, csrfToken),
      'Address deleted.',
    );
    setBusy(false);
    if (ok) {
      setRemoving(null);
      addresses.reload();
    }
  }

  const items = addresses.data?.items || [];
  return (
    <>
      <div className="section-top">
        <h2>YOUR GARAGES</h2>
        <button
          className="btn btn-small"
          onClick={() => {
            setError('');
            setEditing({ value: { ...blankAddress, isDefault: items.length === 0 } });
          }}
        >
          <Plus size={16} /> Add address
        </button>
      </div>
      {addresses.loading ? (
        <div className="skeleton order-skeleton" role="status" aria-label="Loading addresses" />
      ) : addresses.error ? (
        <ErrorPanel error={addresses.error} retry={addresses.reload} />
      ) : items.length ? (
        <div className="address-grid">
          {items.map((address) => (
            <div className="panel address-card" key={address.id}>
              <MapPin size={24} aria-hidden="true" />
              {address.isDefault && (
                <span className="badge status-delivered default-badge">Default</span>
              )}
              <h3>{address.recipientName}</h3>
              <p>
                {address.line1}
                {address.line2 && (
                  <>
                    <br />
                    {address.line2}
                  </>
                )}
                <br />
                {address.city}, {address.state} {address.postalCode}
                <br />
                {address.phone}
              </p>
              <button
                className="text-link"
                onClick={() => {
                  setError('');
                  setEditing({
                    id: address.id,
                    value: {
                      recipientName: address.recipientName,
                      phone: address.phone.replace(/^\+?91(?=\d{10}$)/, ''),
                      line1: address.line1,
                      line2: address.line2,
                      city: address.city,
                      state: address.state,
                      postalCode: address.postalCode,
                      isDefault: address.isDefault,
                    },
                  });
                }}
              >
                Edit address
              </button>
              <button
                className="icon-btn"
                aria-label={`Delete the ${address.city} address`}
                onClick={() => setRemoving(address)}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Where’s your garage?"
          detail="Add a delivery address to make checkout quicker."
        />
      )}
      {editing && (
        <Modal
          title={editing.id ? 'Edit delivery address' : 'Add a delivery address'}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save}>
            <AddressFields
              value={editing.value}
              onChange={(value) => setEditing({ ...editing, value })}
            />
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!editing.value.isDefault}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    value: { ...editing.value, isDefault: event.target.checked },
                  })
                }
              />
              Make this my default address
            </label>
            <FormMessage error={error} />
            <button className="btn btn-primary full" disabled={busy}>
              {busy ? 'Saving…' : 'Save address'} <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal title="Delete this address?" onClose={() => setRemoving(null)}>
          <p>
            {removing.line1}, {removing.city} {removing.postalCode} will be removed from your saved
            addresses. Past orders keep their delivery details.
          </p>
          <button className="btn btn-primary full" disabled={busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Delete address'}
          </button>
        </Modal>
      )}
    </>
  );
}

/* Profile ----------------------------------------------------------- */

function ProfileTab({
  user,
  csrfToken,
  reload,
}: {
  user: AccountUser;
  csrfToken: string | null;
  reload: () => void;
}) {
  const profile = useLoad<{ profile: { name: string; email: string; phone: string } }>(
    '/account/profile',
  );
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.profile.name);
    setPhone(profile.data.profile.phone.replace(/^\+?91(?=\d{10}$)/, ''));
  }, [profile.data]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage({});
    try {
      await send('PUT', '/account/profile', { name: name.trim(), phone }, csrfToken);
      setMessage({ success: 'Profile saved.' });
      reload();
    } catch (error) {
      setMessage({ error: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (profile.loading) return <div className="skeleton order-skeleton" role="status" />;
  if (profile.error) return <ErrorPanel error={profile.error} retry={profile.reload} />;
  return (
    <div className="panel">
      <h2>{user.role === 'customer' ? 'COLLECTOR PROFILE' : 'YOUR PROFILE'}</h2>
      <form onSubmit={save}>
        <div className="form-grid">
          <label>
            Name
            <input
              value={name}
              required
              maxLength={100}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Mobile number
            <input
              value={phone}
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={10}
              pattern="[6-9][0-9]{9}"
              title="A 10-digit Indian mobile number"
              placeholder="Optional"
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
            />
            <small>Used for delivery updates. Leave blank to remove it.</small>
          </label>
          <label className="span-2">
            Email address
            <input value={user.email} disabled readOnly />
            <small>
              {user.emailVerified ? '✓ Verified' : 'Not verified yet — check your inbox.'} · Contact
              the store to change your email.
            </small>
          </label>
        </div>
        <FormMessage {...message} />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'} <ArrowRight size={17} />
        </button>
      </form>
    </div>
  );
}

/* Rewards and store credit ----------------------------------------- */

type FinanceSummary = {
  loyaltyPoints: number;
  walletPaise: number;
  loyaltyPolicy: {
    earnPointsPer100Rupees: number;
    redeemPaisePerPoint: number;
    minimumRedeemPoints: number;
    maximumRedeemPoints: number | null;
  } | null;
  refunds: {
    id: string;
    orderId: string;
    amountPaise: number;
    method: 'store_credit' | 'source';
    status: string;
    reason: string;
    createdAt: string;
  }[];
};

function RewardsTab() {
  const finance = useLoad<FinanceSummary>('/finance');
  if (finance.loading) return <div className="skeleton order-skeleton" role="status" />;
  if (finance.error) return <ErrorPanel error={finance.error} retry={finance.reload} />;
  const summary = finance.data!;
  const policy = summary.loyaltyPolicy;
  return (
    <>
      <div className="section-top">
        <h2>REWARDS & CREDIT</h2>
      </div>
      <div className="account-stats">
        <article className="panel">
          <Gift size={20} aria-hidden="true" />
          <span>Loyalty points</span>
          <strong>{summary.loyaltyPoints.toLocaleString('en-IN')}</strong>
          <small>
            {policy
              ? `Worth ${money(summary.loyaltyPoints * policy.redeemPaisePerPoint)} at checkout`
              : 'Points redemption is not active yet'}
          </small>
        </article>
        <article className="panel">
          <Wallet size={20} aria-hidden="true" />
          <span>Store credit</span>
          <strong>{money(summary.walletPaise)}</strong>
          <small>Use it on your next order at checkout</small>
        </article>
      </div>
      <div className="panel">
        <h3>HOW POINTS WORK</h3>
        {policy ? (
          <ul className="plain-list">
            <li>
              Earn <b>{policy.earnPointsPer100Rupees}</b> points for every ₹100 you spend on models.
            </li>
            <li>
              Each point is worth <b>{money(policy.redeemPaisePerPoint)}</b> off a future order.
            </li>
            <li>
              Redeem from <b>{policy.minimumRedeemPoints}</b> points
              {policy.maximumRedeemPoints
                ? `, up to ${policy.maximumRedeemPoints} points per order`
                : ''}
              .
            </li>
          </ul>
        ) : (
          <p className="muted">The store will announce its rewards programme soon.</p>
        )}
      </div>
      <div className="panel">
        <h3>REFUNDS</h3>
        {!summary.refunds.length ? (
          <p className="muted">No refunds have been recorded.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Refunded to</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td>
                      {date(refund.createdAt)}
                      <small>
                        <Link to={`/account/orders/${refund.orderId}`}>View order</Link> ·{' '}
                        {refund.reason}
                      </small>
                    </td>
                    <td>
                      <b>{money(refund.amountPaise)}</b>
                    </td>
                    <td>
                      {refund.method === 'store_credit'
                        ? 'Store credit'
                        : 'Original payment method'}
                    </td>
                    <td>
                      <Badge status={refund.status} label={refund.status.replaceAll('_', ' ')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* Security ---------------------------------------------------------- */

function SecurityTab({ csrfToken }: { csrfToken: string | null }) {
  const [password, setPassword] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = String(data.get('newPassword') || '');
    setPassword({});
    if (next !== String(data.get('confirm') || '')) {
      setPassword({ error: 'The two new passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      const result = await send<{ message: string }>(
        'POST',
        '/account/password',
        { currentPassword: String(data.get('currentPassword') || ''), newPassword: next },
        csrfToken,
      );
      form.reset();
      setPassword({ success: result.message });
    } catch (error) {
      setPassword({ error: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel">
        <h2>
          <KeyRound size={20} aria-hidden="true" /> CHANGE PASSWORD
        </h2>
        <p className="muted">
          Changing your password signs you out on every other phone and computer.
        </p>
        <form onSubmit={changePassword}>
          <div className="form-grid">
            <label className="span-2">
              Current password
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <small>At least 12 characters.</small>
            </label>
            <label>
              Confirm new password
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
          </div>
          <FormMessage {...password} />
          <button className="btn btn-primary" disabled={busy}>
            Change password <ArrowRight size={17} />
          </button>
        </form>
      </div>
    </>
  );
}
