import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { date, money } from '../api';
import { Badge, Empty, ErrorPanel, Modal } from '../ui';
import { useResource } from '../useResource';
import { PageHeading } from './shared';

type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  verified: boolean;
  joinedAt: string;
  orders: number;
  lifetimePaise: number;
};
type CustomerDetail = {
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    joinedAt: string;
    loyaltyPoints: number;
    walletPaise: number;
  };
  orders: {
    id: string;
    orderNumber: string;
    status: string;
    totalPaise: number;
    createdAt: string;
  }[];
  addresses: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    isDefault: boolean;
  }[];
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const list = useResource<{ items: Customer[] }>(
    `/admin/customers${search ? `?q=${encodeURIComponent(search)}` : ''}`,
  );
  const items = list.data?.items || [];
  return (
    <>
      <PageHeading title="MEET THE COLLECTORS." />
      <div className="admin-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search customers"
            placeholder="Name, email or phone"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
      </div>
      <div className="panel table-panel">
        {list.error ? (
          <ErrorPanel error={list.error} retry={list.reload} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Collector</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Paid orders</th>
                  <th>Lifetime value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="table-customer">
                        <span className="user-avatar">{initials(customer.name)}</span>
                        <span>
                          <b>{customer.name}</b>
                          <small>
                            {customer.email}
                            {!customer.verified && ' · email not verified'}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>{customer.phone || '—'}</td>
                    <td>{customer.city || '—'}</td>
                    <td>{customer.orders}</td>
                    <td>
                      <b>{money(customer.lifetimePaise)}</b>
                    </td>
                    <td>
                      <button className="btn btn-small" onClick={() => setSelected(customer.id)}>
                        View collector <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.loading && <p className="muted">Loading collectors…</p>}
        {!list.loading && !list.error && !items.length && (
          <Empty title="No collectors match" detail="Customers appear here after they sign up." />
        )}
      </div>
      {selected && <CustomerDialog id={selected} onClose={() => setSelected('')} />}
    </>
  );
}

function CustomerDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useResource<CustomerDetail>(`/admin/customers/${id}`);
  const data = detail.data;
  return (
    <Modal title={data?.customer.name || 'Collector'} onClose={onClose} className="wide-modal">
      {detail.error && <p className="form-error">{detail.error.message}</p>}
      {!data && !detail.error && <p className="muted">Loading…</p>}
      {data && (
        <>
          <p>
            {data.customer.email}
            {data.customer.phone && ` · ${data.customer.phone}`} · joined{' '}
            {date(data.customer.joinedAt)}
          </p>
          <div className="cr-mini-stats">
            <div>
              <span>Loyalty points</span>
              <strong>{data.customer.loyaltyPoints}</strong>
            </div>
            <div>
              <span>Store credit</span>
              <strong>{money(data.customer.walletPaise)}</strong>
            </div>
            <div>
              <span>Orders</span>
              <strong>{data.orders.length}</strong>
            </div>
          </div>
          <h3>ORDER HISTORY</h3>
          {data.orders.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link to={`/admin/orders/${order.id}`}>{order.orderNumber}</Link>
                      </td>
                      <td>{date(order.createdAt)}</td>
                      <td>
                        <Badge status={order.status} />
                      </td>
                      <td>{money(order.totalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No orders yet" />
          )}
          <h3>SAVED ADDRESSES</h3>
          {data.addresses.length ? (
            data.addresses.map((address, index) => (
              <p key={index}>
                {[address.line1, address.line2, address.city, address.state, address.postalCode]
                  .filter(Boolean)
                  .join(', ')}
                {address.isDefault && <small> · default</small>}
              </p>
            ))
          ) : (
            <p className="muted">No saved addresses.</p>
          )}
          <Link className="text-link" to={`/admin/finance?customer=${data.customer.id}`}>
            Adjust points or store credit <ArrowRight size={14} />
          </Link>
        </>
      )}
    </Modal>
  );
}
