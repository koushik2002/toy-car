import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, UserRound, Package, MapPin, LogOut, Heart, Plus, X } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { login, loginPhone, logout, saveProfile, saveAddress } from '../services/account';
import { money, date, asset } from '../services/format';
import { transact } from '../services/storage';
import { Badge, Empty, Modal, useUI } from '../components/UI';
import AddressFields, { blankAddress } from '../components/AddressForm';
import ProductCard from '../components/ProductCard';
import type { Address } from '../types';
export default function Account() {
  const state = useStore(),
    ui = useUI(),
    nav = useNavigate(),
    location = useLocation(),
    [params] = useSearchParams(),
    user = state.users.find((u) => u.id === state.userId);
  const [phone, setPhone] = useState(''),
    [otp, setOtp] = useState(''),
    [otpSent, setOtpSent] = useState(false),
    [showLogin, setShowLogin] = useState(!user),
    [status, setStatus] = useState(''),
    [address, setAddress] = useState<Address | null>(null),
    [name, setName] = useState(user?.name ?? ''),
    [email, setEmail] = useState(user?.email ?? '');
  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
  }, [user?.id]);
  const tab = location.pathname.split('/')[2] || 'orders';
  const orders = state.orders.filter(
    (o) => o.userId === user?.id && (!status || o.status === status),
  );
  function afterLogin() {
    setShowLogin(false);
    if (params.get('next') === 'checkout') nav('/checkout');
  }
  const loginPanel = (
    <div className="login-panel">
      <span className="eyebrow red">YOUR COLLECTION. YOUR CORNER.</span>
      <h2>WELCOME TO THE GARAGE.</h2>
      <p>Pick a demo collector to explore their orders, or try phone + OTP.</p>
      <div className="demo-users">
        {state.users
          .filter((u) => u.role === 'customer')
          .slice(0, 3)
          .map((u) => (
            <button
              key={u.id}
              onClick={() => {
                login(u.id);
                setName(u.name);
                setEmail(u.email);
                afterLogin();
              }}
            >
              <span className="user-avatar">
                {u.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </span>
              <span>
                <b>{u.name}</b>
                <small>
                  {u.addresses[0]?.city ?? 'New collector'} · {u.phone}
                </small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
      </div>
      <div className="or-divider">OR USE A DEMO OTP</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (otpSent) {
            ui.run(() => {
              const id = loginPhone(phone, otp);
              const u = state.users.find((u) => u.id === id);
              setName(u?.name ?? 'New Collector');
              setEmail(u?.email ?? '');
              afterLogin();
            }, 'Signed in.');
          } else {
            if (/^[6-9]\d{9}$/.test(phone)) setOtpSent(true);
            else ui.toast('Enter a valid 10-digit Indian mobile number.', true);
          }
        }}
      >
        <label>
          Mobile number
          <input
            autoComplete="tel-national"
            inputMode="tel"
            pattern="[6-9][0-9]{9}"
            maxLength={10}
            required
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setOtpSent(false);
            }}
            placeholder="9876500001"
          />
        </label>
        {otpSent && (
          <>
            <div className="demo-otp">
              Demo OTP: <strong>123456</strong> · No SMS is sent
            </div>
            <label>
              One-time password
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </label>
          </>
        )}
        <button className="btn btn-primary full">
          {otpSent ? 'Verify demo OTP' : 'Show demo OTP'}
          <ArrowRight size={17} />
        </button>
      </form>
    </div>
  );
  if (!user) return <div className="container page login-page">{loginPanel}</div>;
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow red">THE COLLECTOR'S CORNER</span>
        <h1>HEY, {user.name.split(' ')[0].toUpperCase()}.</h1>
        <p>Your orders, your grails, your growing garage.</p>
      </div>
      <div className="account-layout">
        <aside className="account-nav">
          <div className="account-user">
            <span className="user-avatar">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
            <div>
              <b>{user.name}</b>
              <small>{user.phone}</small>
            </div>
          </div>
          <NavLink to="/account" end>
            <Package size={17} /> My orders
          </NavLink>
          <NavLink to="/wishlist">
            <Heart size={17} /> Wishlist
          </NavLink>
          <NavLink to="/account/addresses">
            <MapPin size={17} /> Saved addresses
          </NavLink>
          <NavLink to="/account/profile">
            <UserRound size={17} /> Profile
          </NavLink>
          <button onClick={() => setShowLogin(true)}>
            Switch demo collector <ArrowRight size={15} />
          </button>
          <button
            onClick={() => {
              logout();
              setShowLogin(true);
            }}
          >
            <LogOut size={17} /> Sign out
          </button>
        </aside>
        <section className="account-content">
          {tab === 'orders' ? (
            <>
              <div className="section-top">
                <h2>MY ORDERS</h2>
                <select
                  aria-label="Filter my orders by status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">All statuses</option>
                  {[
                    'Placed',
                    'Confirmed',
                    'Packed',
                    'Shipped',
                    'Out for delivery',
                    'Delivered',
                    'Cancelled',
                    'Return requested',
                    'Refunded',
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              {orders.length ? (
                orders.map((o) => (
                  <article className="order-card" key={o.id}>
                    <div className="order-card-top">
                      <div>
                        <Link to={`/order/${o.id}`}>
                          <b>{o.id}</b>
                        </Link>
                        <small>
                          Placed {date(o.at)} · {o.items.reduce((n, i) => n + i.quantity, 0)}{' '}
                          model(s)
                        </small>
                      </div>
                      <Badge status={o.status} />
                    </div>
                    <div className="order-card-body">
                      <div className="order-images">
                        {o.items.slice(0, 3).map((i) => (
                          <img key={i.productId} src={asset(i.image)} alt={i.name} />
                        ))}
                      </div>
                      <div>
                        <b>{o.items[0].name}</b>
                        {o.items.length > 1 && <small>+ {o.items.length - 1} more models</small>}
                        <strong>{money(o.total)}</strong>
                      </div>
                      <Link className="btn btn-small" to={`/order/${o.id}`}>
                        View order <ArrowRight size={15} />
                      </Link>
                    </div>
                  </article>
                ))
              ) : (
                <Empty title="Your next story starts here" detail="No orders with this status.">
                  <Link className="btn btn-primary" to="/shop">
                    Explore the collection
                  </Link>
                </Empty>
              )}
            </>
          ) : tab === 'addresses' ? (
            <>
              <div className="section-top">
                <h2>YOUR GARAGES</h2>
                <button
                  className="btn btn-small"
                  onClick={() =>
                    setAddress({ ...blankAddress, name: user.name, phone: user.phone })
                  }
                >
                  <Plus size={16} /> Add address
                </button>
              </div>
              <div className="address-grid">
                {user.addresses.map((a) => (
                  <div className="panel address-card" key={a.id}>
                    <MapPin size={24} />
                    <h3>{a.name}</h3>
                    <p>
                      {a.line}
                      <br />
                      {a.city}, {a.state} {a.pin}
                      <br />
                      {a.phone}
                    </p>
                    <button className="text-link" onClick={() => setAddress(a)}>
                      Edit address
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Delete ${a.city} address`}
                      onClick={() =>
                        transact((d) => {
                          const u = d.users.find((u) => u.id === d.userId);
                          if (u) u.addresses = u.addresses.filter((x) => x.id !== a.id);
                        })
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              {!user.addresses.length && (
                <Empty
                  title="Where's your garage?"
                  detail="Add a delivery address to make checkout quicker."
                />
              )}
            </>
          ) : (
            <div className="panel">
              <h2>COLLECTOR PROFILE</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ui.run(() => saveProfile(name, email), 'Profile saved.');
                }}
              >
                <div className="form-grid">
                  <label>
                    Name
                    <input value={name} required onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label>
                    Email
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label>
                    Phone
                    <input value={user.phone} disabled />
                  </label>
                </div>
                <button className="btn btn-primary">
                  Save profile <ArrowRight size={17} />
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
      {showLogin && (
        <Modal title="Switch collector" onClose={() => setShowLogin(false)}>
          {loginPanel}
        </Modal>
      )}
      {address && (
        <Modal title="Delivery address" onClose={() => setAddress(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ui.run(() => saveAddress(address), 'Address saved.')) setAddress(null);
            }}
          >
            <AddressFields value={address} onChange={setAddress} />
            <button className="btn btn-primary full">
              Save address <ArrowRight size={17} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export function Wishlist() {
  const state = useStore(),
    products = state.products.filter((p) => state.wishlist.includes(p.id));
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow red">THE ONES THAT CAUGHT YOUR EYE</span>
        <h1>YOUR GRAIL LIST.</h1>
        <p>Good taste. Save it today, add it to your shelf tomorrow.</p>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
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
