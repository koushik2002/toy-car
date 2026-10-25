import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowUpRight } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import { money, dateTime } from '../services/format';
import AdminLayout from '../components/AdminLayout';
import { Empty } from '../components/UI';
export default function AdminOrders() {
  const s = useStore(),
    [q, setQ] = useState(''),
    [payment, setPayment] = useState('');
  const orders = s.orders.filter(
    (o) =>
      (!payment || o.payment === payment) &&
      `${o.id} ${s.users.find((u) => u.id === o.userId)?.name}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <AdminLayout title="WHATSAPP REQUESTS.">
      <div className="admin-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search orders"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order number or collector"
          />
        </div>
        <select
          aria-label="Payment filter"
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
        >
          <option value="">All payments</option>
          {['WhatsApp', 'COD'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <p className="muted">
        {orders.length} browser-local requests · Open one to prepare a bill or record a demo
        payment.
      </p>
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Collector</th>
                <th>When (IST)</th>
                <th>Bill</th>
                <th>Payment</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/admin/orders/${o.id}`}>{o.id}</Link>
                  </td>
                  <td>
                    {s.users.find((u) => u.id === o.userId)?.name}
                    <small>{o.address.city}</small>
                  </td>
                  <td>{dateTime(o.at)}</td>
                  <td>
                    {s.bills.some((bill) => bill.orderId === o.id) ? 'Saved' : 'Not generated'}
                  </td>
                  <td>
                    {o.payment}
                    <small>
                      {o.paid
                        ? 'Paid (demo)'
                        : o.status === 'Refunded'
                          ? 'Refunded'
                          : 'Payment pending'}
                    </small>
                  </td>
                  <td>
                    <b>{money(o.total)}</b>
                  </td>
                  <td>
                    <Link
                      className="icon-btn"
                      aria-label={`Open order ${o.id}`}
                      to={`/admin/orders/${o.id}`}
                    >
                      <ArrowUpRight size={17} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!orders.length && <Empty title="No requests match" />}
      </div>
    </AdminLayout>
  );
}
