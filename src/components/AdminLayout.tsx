import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingBag,
  Users,
  Tags,
  RefreshCw,
  ArrowUpRight,
  CircleDot,
} from 'lucide-react';
import { useStore } from '../hooks/useStore';
const items = [
  ['', 'Dashboard', LayoutDashboard],
  ['products', 'Products', Package],
  ['inventory', 'Inventory', Boxes],
  ['orders', 'Orders', ShoppingBag],
  ['customers', 'Collectors', Users],
  ['offers', 'Offers & coupons', Tags],
  ['tally', 'Tally sync', RefreshCw],
] as const;
export default function AdminLayout({
  children,
  title,
  kicker = 'TINY KARS / CONTROL ROOM',
}: {
  children: React.ReactNode;
  title: string;
  kicker?: string;
}) {
  const state = useStore();
  return (
    <div className="container admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-title">
          <CircleDot size={23} />
          <div>
            <b>THE CONTROL ROOM</b>
            <small>Admin demo · live local data</small>
          </div>
        </div>
        <nav aria-label="Admin navigation">
          {items.map(([path, label, Icon]) => (
            <NavLink end={!path} key={path} to={`/admin${path ? '/' + path : ''}`}>
              <Icon size={18} />
              {label}
              {path === 'tally' && state.jobs.some((j) => j.status === 'failed') && (
                <span className="admin-nav-count">
                  {state.jobs.filter((j) => j.status === 'failed').length}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-note">
          <span className={`live-dot ${state.tally.offline ? 'offline' : ''}`} />
          Tally {state.tally.offline ? 'offline' : 'connected'}
          <small>Simulated connection</small>
        </div>
        <Link className="text-link" to="/features">
          Demo feature map <ArrowUpRight size={15} />
        </Link>
      </aside>
      <section className="admin-content">
        <div className="admin-page-heading">
          <span className="eyebrow red">{kicker}</span>
          <h1>{title}</h1>
          <span className="admin-demo-pill">DEMO WORKSPACE</span>
        </div>
        {children}
      </section>
    </div>
  );
}
