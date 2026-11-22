import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, ShieldCheck, Tag } from 'lucide-react';
import { money, mutate } from './api';
import { useSession } from './session';
import { useCart } from './cart';
import { Empty } from './ui';
import { CartLineItem, CartTotals, ShippingProgress } from './Layout';

export function CartPage() {
  const cart = useCart();
  const { user, config, csrfToken } = useSession();
  const team = !!user && user.role !== 'customer';
  const customer = user?.role === 'customer';
  const [voucherInput, setVoucherInput] = useState('');
  const [voucher, setVoucher] = useState<{ code: string; discountPaise: number }>();
  const [voucherError, setVoucherError] = useState('');
  const [checkingVoucher, setCheckingVoucher] = useState(false);
  const cartKey = cart.lines.map((line) => `${line.product.id}:${line.quantity}`).join('|');
  useEffect(() => {
    setVoucher(undefined);
    setVoucherError('');
  }, [cartKey]);

  async function applyVoucher(event: FormEvent) {
    event.preventDefault();
    if (!customer || !voucherInput.trim()) return;
    setCheckingVoucher(true);
    setVoucherError('');
    try {
      const result = await mutate<{ code: string; discountPaise: number }>(
        '/vouchers/preview',
        {
          code: voucherInput.trim().toUpperCase(),
          items: cart.lines.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
          })),
        },
        csrfToken,
      );
      setVoucher(result);
      setVoucherInput(result.code);
    } catch (error) {
      setVoucher(undefined);
      setVoucherError((error as Error).message);
    } finally {
      setCheckingVoucher(false);
    }
  }
  return (
    <div className="container page">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight size={13} />
        Your garage
      </div>
      <div className="page-heading">
        <span className="eyebrow red">SHELF SPACE WELL SPENT</span>
        <h1>
          YOUR GARAGE<span className="title-count">{cart.count}</span>
        </h1>
        <p>Great picks. Let's get them home.</p>
      </div>
      {cart.count ? (
        <div className="cart-layout">
          <div>
            <ShippingProgress value={cart.subtotalPaise} />
            {cart.lines.map((line) => (
              <CartLineItem
                key={line.product.id}
                product={line.product}
                quantity={line.quantity}
                page
              />
            ))}
            <Link className="text-link" to="/shop">
              Keep the hunt going <ArrowRight size={16} />
            </Link>
            <div className="notice cart-voucher">
              <Tag size={20} />
              <div>
                <b>GOT A VOUCHER?</b>
                {customer ? (
                  <form onSubmit={applyVoucher}>
                    <input
                      aria-label="Cart voucher code"
                      maxLength={32}
                      placeholder="Enter code"
                      value={voucherInput}
                      onChange={(event) => setVoucherInput(event.target.value.toUpperCase())}
                    />
                    <button className="btn btn-small" disabled={checkingVoucher}>
                      {checkingVoucher ? 'Checking…' : 'Apply'}
                    </button>
                  </form>
                ) : (
                  <span>
                    Sign in to check a discount code. Store credit and points apply at checkout.
                  </span>
                )}
                {voucher && (
                  <small role="status">
                    {voucher.code} saves {money(voucher.discountPaise)}. The server confirms it at
                    checkout.
                  </small>
                )}
                {voucherError && (
                  <small className="form-error" role="alert">
                    {voucherError}
                  </small>
                )}
              </div>
            </div>
          </div>
          <aside className="summary-card">
            <h2>THE FINAL LAP</h2>
            <CartTotals discountPaise={voucher?.discountPaise} />
            {team ? (
              <p className="muted">Team accounts cannot place customer orders.</p>
            ) : (
              <Link
                className="btn btn-primary full"
                to={
                  user
                    ? `/checkout${voucher ? `?voucher=${encodeURIComponent(voucher.code)}` : ''}`
                    : '/account/login?next=%2Fcheckout'
                }
              >
                {user ? 'Head to checkout' : 'Sign in to check out'} <ArrowRight size={18} />
              </Link>
            )}
            <p className="summary-trust">
              <ShieldCheck size={15} />{' '}
              {config?.commerce.checkoutEnabled
                ? config.commerce.paymentMode === 'test'
                  ? 'Safe local test checkout'
                  : 'Secure payment by Razorpay'
                : 'Online payment opens soon'}
            </p>
          </aside>
        </div>
      ) : (
        <Empty
          title="Your garage is waiting"
          detail="Start with one car. Who knows where it'll lead?"
        >
          <Link to="/shop" className="btn btn-primary">
            Explore the collection <ArrowRight size={17} />
          </Link>
        </Empty>
      )}
    </div>
  );
}
