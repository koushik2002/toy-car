import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Boxes,
  IndianRupee,
  MessageSquareWarning,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dateTime, money } from '../api';
import { useResource } from '../useResource';
import { Badge, Empty, ErrorPanel, PageLoading } from '../ui';
import { PageHeading } from './shared';

type Dashboard = {
  todayOrders: number;
  onlineRevenuePaise: number;
  averageOrderPaise: number;
  offlineRevenueTodayPaise: number;
  offlineBillsToday: number;
  lowStock: number;
  pendingShipments: number;
  failedTallyJobs: number;
  failedNotifications: number;
  openRequests: number;
  customers: number;
  daily: { day: string; orders: number; revenuePaise: number }[];
  brandSales: { brand: string; revenuePaise: number }[];
  latestOrders: {
    id: string;
    orderNumber: string;
    status: string;
    totalPaise: number;
    createdAt: string;
    customerName: string | null;
  }[];
};

const tooltip = {
  background: '#161c26',
  border: '1px solid #303849',
  borderRadius: 8,
  color: '#fff',
};

export function DashboardPage() {
  const data = useResource<Dashboard>('/admin/dashboard');
  if (data.loading) return <PageLoading label="Loading the dashboard…" />;
  if (data.error || !data.data)
    return <ErrorPanel error={data.error || new Error('No data.')} retry={data.reload} />;
  const d = data.data;
  const metrics = [
    ['Today’s orders', d.todayOrders, ShoppingBag, '/admin/orders'],
    ['Online revenue', money(d.onlineRevenuePaise), IndianRupee, '/admin/orders'],
    ['Average order value', money(d.averageOrderPaise), TrendingUp, '/admin/orders'],
    [
      'Counter sales today',
      `${money(d.offlineRevenueTodayPaise)} · ${d.offlineBillsToday} bills`,
      ReceiptText,
      '/admin/billing',
    ],
    ['Low-stock models', d.lowStock, Boxes, '/admin/inventory?low=1'],
    ['Pending shipments', d.pendingShipments, Truck, '/admin/orders'],
    ['Open customer requests', d.openRequests, MessageSquareWarning, '/admin/orders?request=open'],
    ['Failed Tally syncs', d.failedTallyJobs, RefreshCw, '/admin/tally'],
  ] as const;
  const daily = d.daily.map((row) => ({
    day: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
      new Date(`${row.day}T00:00:00+05:30`),
    ),
    orders: row.orders,
  }));
  const brands = d.brandSales.map((row) => ({ brand: row.brand, revenue: row.revenuePaise / 100 }));
  return (
    <>
      <PageHeading title="THE GARAGE, AT A GLANCE." />
      <p className="muted">Every order, every model, every moving part. All in one place.</p>
      <div className="kpi-grid cr-kpi-grid">
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
              <AreaChart data={daily} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
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
                <Tooltip contentStyle={tooltip} />
                <Area
                  type="monotone"
                  dataKey="orders"
                  name="Paid orders"
                  stroke="#ef3340"
                  fill="url(#chart-red)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel chart-panel">
          <h2>SALES BY BRAND</h2>
          <small className="muted">Item value of paid online orders · before discounts</small>
          <div className="chart-box">
            {brands.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={brands} margin={{ top: 20, right: 10, bottom: 20, left: 0 }}>
                  <XAxis
                    dataKey="brand"
                    tick={{ fill: '#a8b0bf', fontSize: 9 }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(v) => (Number(v) >= 1000 ? `${Number(v) / 1000}k` : String(v))}
                    tick={{ fill: '#a8b0bf', fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value) => money(Number(value) * 100)}
                    contentStyle={tooltip}
                  />
                  <Bar dataKey="revenue" name="Sales" fill="#ffdc49" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty title="No sales yet" detail="Paid orders will appear here." />
            )}
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
        {d.latestOrders.length ? (
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
                {d.latestOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/admin/orders/${order.id}`}>{order.orderNumber}</Link>
                    </td>
                    <td>{order.customerName || '—'}</td>
                    <td>{dateTime(order.createdAt)}</td>
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
          <Empty title="No orders yet" detail="Paid online orders will appear here." />
        )}
      </div>
      {d.failedNotifications > 0 && (
        <p className="muted">
          {d.failedNotifications} customer email or WhatsApp messages could not be delivered. Check
          the provider settings.
        </p>
      )}
    </>
  );
}
