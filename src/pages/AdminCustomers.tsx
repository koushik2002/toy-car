import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { money, date } from '../services/format';
import AdminLayout from '../components/AdminLayout';
import { Modal, Badge, Empty } from '../components/UI';
export default function AdminCustomers() {
  const s = useStore(),
    [q, setQ] = useState(''),
    [selected, setSelected] = useState('');
  const customers = s.users.filter(
    (u) =>
      u.role === 'customer' &&
      `${u.name} ${u.phone} ${u.email}`.toLowerCase().includes(q.toLowerCase()),
  );
  const user = s.users.find((u) => u.id === selected),
    history = s.orders.filter((o) => o.userId === selected);
  return (
    <AdminLayout title="MEET THE COLLECTORS.">
      <div className="admin-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search customers"
            placeholder="Name, phone or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Collector</th>
                <th>Phone</th>
                <th>City</th>
                <th>Orders</th>
                <th>Lifetime order value</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {customers.map((u) => {
                const orders = s.orders.filter((o) => o.userId === u.id);
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="table-customer">
                        <span className="user-avatar">
                          {u.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </span>
                        <span>
                          <b>{u.name}</b>
                          <small>{u.email || '—'}</small>
                        </span>
                      </div>
                    </td>
                    <td>{u.phone}</td>
                    <td>{u.addresses[0]?.city ?? '—'}</td>
                    <td>{orders.length}</td>
                    <td>
                      <b>
                        {money(
                          orders
                            .filter((o) => !['Cancelled', 'Refunded'].includes(o.status))
                            .reduce((n, o) => n + o.total, 0),
                        )}
                      </b>
                    </td>
                    <td>
                      <button className="btn btn-small" onClick={() => setSelected(u.id)}>
                        View collector <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!customers.length && <Empty title="No collectors match" />}
      </div>
      {user && (
        <Modal title={user.name} onClose={() => setSelected('')} className="wide-modal">
          <p>
            {user.phone} · {user.email}
          </p>
          <h3>ORDER HISTORY · {history.length} ORDERS</h3>
          {history.length ? (
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
                  {history.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/admin/orders/${o.id}`}>{o.id}</Link>
                      </td>
                      <td>{date(o.at)}</td>
                      <td>
                        <Badge status={o.status} />
                      </td>
                      <td>{money(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No orders yet" />
          )}
          <h3>SAVED ADDRESSES</h3>
          {user.addresses.map((a) => (
            <p key={a.id}>
              {a.line}, {a.city}, {a.state} {a.pin}
            </p>
          ))}
        </Modal>
      )}
    </AdminLayout>
  );
}
