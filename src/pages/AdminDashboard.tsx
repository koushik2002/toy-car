import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ShoppingBag,
  IndianRupee,
  TrendingUp,
  Boxes,
  Truck,
  RefreshCw,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';
import AdminLayout from '../components/AdminLayout';
import { useStore } from '../hooks/useStore';
import { money, dateTime } from '../services/format';
import { Badge } from '../components/UI';
export default function AdminDashboard() {
  const s = useStore(),
    today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
    todayOrders = s.orders.filter(
      (o) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(o.at)) ===
        today,
    ),
    revenue = s.orders
      .filter((o) => !['Cancelled', 'Refunded', 'Return requested'].includes(o.status))
      .reduce((n, o) => n + o.total, 0),
    low = s.products.filter((p) => p.stock <= p.threshold).length,
    failed = s.jobs.filter((j) => j.status === 'failed').length;
  const charts = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000),
      day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    return {
      day: new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(d),
      orders: s.orders.filter(
        (o) =>
          new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(o.at)) ===
          day,
      ).length,
    };
  });
  const brandRevenue = s.products.reduce<Record<string, number>>((a, p) => {
    a[p.brand] ??= 0;
    return a;
  }, {});
  s.orders
    .filter((o) => !['Cancelled', 'Refunded', 'Return requested'].includes(o.status))
    .forEach((o) =>
      o.items.forEach((i) => {
        const brand = s.products.find((p) => p.id === i.productId)?.brand ?? 'Archived';
        brandRevenue[brand] = (brandRevenue[brand] ?? 0) + i.price * i.quantity;
      }),
    );
  const metrics = [
    ['Today’s orders', todayOrders.length, ShoppingBag, '/admin/orders'],
    ['Order revenue', money(revenue), IndianRupee, '/admin/orders'],
    [
      'Average order value',
      money(
        revenue /
          Math.max(
            1,
            s.orders.filter(
              (o) => !['Cancelled', 'Refunded', 'Return requested'].includes(o.status),
            ).length,
          ),
      ),
      TrendingUp,
      '/admin/orders',
    ],
    ['Low-stock models', low, Boxes, '/admin/inventory'],
    [
      'Pending shipments',
      s.orders.filter((o) => ['Placed', 'Confirmed', 'Packed'].includes(o.status)).length,
      Truck,
      '/admin/orders',
    ],
    ['Failed sync jobs', failed, RefreshCw, '/admin/tally'],
  ] as const;
  return (
    <AdminLayout title="THE GARAGE, AT A GLANCE.">
      <p className="muted">Every order, every model, every moving part. All in one place.</p>
      <div className="kpi-grid">
        {metrics.map(([name, value, Icon, path]) => (
          <Link to={path} className="kpi" key={name}>
            <div>
              <Icon size={19} />
              <ArrowUpRight size={16} />
            </div>
            <strong>{value}</strong>
            <span>{name}</span>
          </Link>
        ))}
      </div>
      <div className="charts-grid">
        <div className="panel chart-panel">
          <div className="section-top">
            <h2>ORDERS, LAST 30 DAYS</h2>
            <Activity size={19} />
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="chart-red" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef3340" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ef3340" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#252c38" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: '#a8b0bf', fontSize: 10 }}
                  interval={6}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#a8b0bf', fontSize: 10 }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#161c26',
                    border: '1px solid #303849',
                    borderRadius: 8,
                    color: '#fff',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke="#ef3340"
                  fill="url(#chart-red)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel chart-panel">
          <h2>GROSS ITEM SALES BY BRAND</h2>
          <small className="muted">Before cart discounts · active orders</small>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={Object.entries(brandRevenue).map(([brand, revenue]) => ({ brand, revenue }))}
                margin={{ top: 20, right: 10, bottom: 20, left: 0 }}
              >
                <XAxis
                  dataKey="brand"
                  tick={{ fill: '#a8b0bf', fontSize: 9 }}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  tickFormatter={(v) => `${Number(v) / 1000}k`}
                  tick={{ fill: '#a8b0bf', fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value) => money(Number(value))}
                  contentStyle={{
                    background: '#161c26',
                    border: '1px solid #303849',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="revenue" fill="#ffdc49" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="section-top">
          <h2>LATEST ORDERS</h2>
          <Link className="text-link" to="/admin/orders">
            All orders <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Collector</th>
                <th>Placed</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {s.orders.slice(0, 6).map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/admin/orders/${o.id}`}>{o.id}</Link>
                  </td>
                  <td>{s.users.find((u) => u.id === o.userId)?.name}</td>
                  <td>{dateTime(o.at)}</td>
                  <td>
                    <Badge status={o.status} />
                  </td>
                  <td>{money(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
