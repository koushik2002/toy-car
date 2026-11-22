import { Suspense, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  Barcode,
  Boxes,
  CircleDot,
  LayoutDashboard,
  Package,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ScrollText,
  ShoppingBag,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { request } from '../api';
import { Empty } from '../ui';
import { useRole } from './shared';

type Role = 'seller' | 'staff' | 'admin' | 'super_admin';
const managers: Role[] = ['admin', 'super_admin'];
const sections: [path: string, label: string, Icon: LucideIcon, roles: Role[]][] = [
  ['', 'Dashboard', LayoutDashboard, managers],
  ['products', 'Products', Package, managers],
  ['inventory', 'Inventory', Boxes, managers],
  ['orders', 'Orders & delivery', ShoppingBag, ['staff', ...managers]],
  ['billing', 'Billing desk', ReceiptText, ['seller', ...managers]],
  ['customers', 'Collectors', Users, managers],
  ['offers', 'Offers & shipping', Tags, managers],
  ['finance', 'Loyalty & refunds', Wallet, managers],
  ['tally', 'Tally sync', RefreshCw, managers],
  ['labels', 'Barcode labels', Barcode, managers],
  ['audit', 'Audit logs', ScrollText, managers],
  ['team', 'Team & codes', ShieldCheck, ['super_admin']],
];
const homeFor: Record<Role, string> = {
  seller: '/admin/billing',
  staff: '/admin/orders',
  admin: '/admin',
  super_admin: '/admin',
};
const roleNames: Record<Role, string> = {
  seller: 'Billing desk',
  staff: 'Delivery staff',
  admin: 'Admin',
  super_admin: 'Super admin',
};

export function AdminLayout() {
  const { user, role, manager } = useRole();
  const location = useLocation();
  const [counts, setCounts] = useState<{ failedTallyJobs: number; openRequests: number }>();
  useEffect(() => {
    if (!manager) return;
    void request<{ failedTallyJobs: number; openRequests: number }>('/admin/dashboard').then(
      setCounts,
      () => {},
    );
  }, [manager, location.pathname]);

  if (!user || role === 'customer' || !role)
    return (
      <div className="container page">
        <Empty
          title="This area is for the Tiny Kars team"
          detail="Your collector account and orders live in your account."
        >
          <Link className="btn btn-primary" to="/account">
            Go to my account
          </Link>
        </Empty>
      </div>
    );
  const teamRole = role as Role;
  const section = location.pathname.split('/')[2] || '';
  const current = sections.find(([path]) => path === section);
  if (current && !current[3].includes(teamRole)) return <Navigate replace to={homeFor[teamRole]} />;
  const visible = sections.filter(([, , , roles]) => roles.includes(teamRole));

  return (
    <div className="container admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-title">
          <CircleDot size={23} />
          <div>
            <b>THE CONTROL ROOM</b>
            <small>
              {user.name} · {roleNames[teamRole]}
            </small>
          </div>
        </div>
        <nav aria-label="Control room navigation">
          {visible.map(([path, label, Icon]) => {
            const count =
              path === 'tally'
                ? counts?.failedTallyJobs
                : path === 'orders'
                  ? counts?.openRequests
                  : 0;
            return (
              <NavLink end={!path} key={path} to={`/admin${path ? `/${path}` : ''}`}>
                <Icon size={18} />
                {label}
                {!!count && (
                  <span
                    className="admin-nav-count"
                    aria-label={path === 'tally' ? `${count} failed` : `${count} open requests`}
                  >
                    {count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        {manager && (
          <div className="admin-sidebar-note">
            <span className="live-dot offline" />
            Tally: not connected yet
            <small>Needs the client’s TallyPrime details</small>
          </div>
        )}
        <Link className="text-link" to="/shop">
          ← Customer view <ArrowUpRight size={15} />
        </Link>
      </aside>
      <section className="admin-content">
        <Suspense
          fallback={<div className="skeleton skeleton-title" role="status" aria-label="Loading" />}
        >
          <Outlet />
        </Suspense>
      </section>
    </div>
  );
}
