import { lazy, type ReactNode } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import '../styles.css';
import './store.css';
import './storefront.css';
import './account.css';
import './admin/control-room.css';
import { SessionProvider, useSession } from './session';
import { UIProvider, Empty, ErrorPanel, PageLoading } from './ui';
import { CartProvider } from './cart';
import { WishlistProvider } from './wishlistStore';
import { Layout } from './Layout';
import { HomePage } from './Home';
import { ShopPage } from './Shop';
import { ProductPage } from './ProductPage';
import { CartPage } from './CartPage';
import { CheckoutPage } from './Checkout';
import { WishlistPage } from './WishlistPage';
import { AccountPage, AuthPage } from './Account';
import { CustomerInvoicePage, CustomerOrderDetail } from './OrderDetail';

// The control room (charts, billing, labels) loads only when a team member opens it.
const AdminLayout = lazy(() =>
  import('./admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const DashboardPage = lazy(() =>
  import('./admin/Dashboard').then((m) => ({ default: m.DashboardPage })),
);
const ProductsPage = lazy(() =>
  import('./admin/Products').then((m) => ({ default: m.ProductsPage })),
);
const InventoryPage = lazy(() =>
  import('./admin/Inventory').then((m) => ({ default: m.InventoryPage })),
);
const OrderDeskDetail = lazy(() =>
  import('./admin/Orders').then((m) => ({ default: m.OrderDeskDetail })),
);
const OrdersPage = lazy(() => import('./admin/Orders').then((m) => ({ default: m.OrdersPage })));
const CustomersPage = lazy(() =>
  import('./admin/Customers').then((m) => ({ default: m.CustomersPage })),
);
const OffersPage = lazy(() => import('./admin/Offers').then((m) => ({ default: m.OffersPage })));
const FinancePage = lazy(() => import('./admin/Finance').then((m) => ({ default: m.FinancePage })));
const BillingPage = lazy(() => import('./admin/Billing').then((m) => ({ default: m.BillingPage })));
const InvoicePage = lazy(() => import('./admin/Billing').then((m) => ({ default: m.InvoicePage })));
const TallyPage = lazy(() => import('./admin/Tally').then((m) => ({ default: m.TallyPage })));
const LabelsPage = lazy(() => import('./admin/Labels').then((m) => ({ default: m.LabelsPage })));
const TeamPage = lazy(() => import('./admin/Team').then((m) => ({ default: m.TeamPage })));
const AuditLogsPage = lazy(() =>
  import('./admin/AuditLogs').then((m) => ({ default: m.AuditLogsPage })),
);

function loginPath(location: { pathname: string; search: string }) {
  return `/account/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}

function SessionFailed({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="container page">
      <ErrorPanel error={error} retry={retry} />
    </div>
  );
}

/** Signed-in pages. Waits for the session check so a refresh never flashes the login page. */
function SignedIn({ children }: { children: ReactNode }) {
  const { user, loading, error, reload } = useSession();
  const location = useLocation();
  if (loading) return <PageLoading label="Opening your garage…" />;
  // A failed check is not the same as being signed out, so offer a retry rather than the login page.
  if (!user && error) return <SessionFailed error={error} retry={reload} />;
  return user ? <>{children}</> : <Navigate replace to={loginPath(location)} />;
}

/** The catalogue is login-first unless the shop turns on public browsing. */
function Catalogue({ children }: { children: ReactNode }) {
  const { user, config, loading, error, reload } = useSession();
  const location = useLocation();
  if (loading) return <PageLoading label="Opening the collection…" />;
  if (!user && error) return <SessionFailed error={error} retry={reload} />;
  if (user || config?.catalogue.publicBrowsing) return <>{children}</>;
  return <Navigate replace to={loginPath(location)} />;
}

function LegacyInvoice() {
  const { id } = useParams();
  return <Navigate replace to={`/admin/billing/invoices/${id}`} />;
}

function NotFound() {
  return (
    <div className="container page">
      <Empty title="Wrong turn?" detail="Your next collectible is one click away.">
        <Link className="btn btn-primary" to="/">
          Back to the garage
        </Link>
      </Empty>
    </div>
  );
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/shop"
          element={
            <Catalogue>
              <ShopPage />
            </Catalogue>
          }
        />
        <Route
          path="/product/:id"
          element={
            <Catalogue>
              <ProductPage />
            </Catalogue>
          }
        />
        <Route path="/cart" element={<CartPage />} />
        <Route
          path="/checkout"
          element={
            <SignedIn>
              <CheckoutPage />
            </SignedIn>
          }
        />
        <Route
          path="/wishlist"
          element={
            <SignedIn>
              <WishlistPage />
            </SignedIn>
          }
        />
        <Route path="/account/register" element={<AuthPage mode="register" />} />
        <Route path="/account/login" element={<AuthPage mode="login" />} />
        <Route path="/account/forgot" element={<AuthPage mode="forgot" />} />
        <Route path="/account/reset" element={<AuthPage mode="reset" />} />
        <Route path="/account/verify" element={<AuthPage mode="verify" />} />
        <Route
          path="/account/orders/:id"
          element={
            <SignedIn>
              <CustomerOrderDetail />
            </SignedIn>
          }
        />
        <Route
          path="/account/orders/:id/invoice"
          element={
            <SignedIn>
              <CustomerInvoicePage />
            </SignedIn>
          }
        />
        <Route
          path="/account/*"
          element={
            <SignedIn>
              <AccountPage />
            </SignedIn>
          }
        />
        <Route
          path="/admin"
          element={
            <SignedIn>
              <AdminLayout />
            </SignedIn>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDeskDetail />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="offers" element={<OffersPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="billing/invoices/:id" element={<InvoicePage />} />
          <Route path="tally" element={<TallyPage />} />
          <Route path="labels" element={<LabelsPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="audit" element={<AuditLogsPage />} />
        </Route>
        <Route path="/billing" element={<Navigate replace to="/admin/billing" />} />
        <Route path="/billing/invoices/:id" element={<LegacyInvoice />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

export default function ProductionApp() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <UIProvider>
          <CartProvider>
            <WishlistProvider>
              <AppRoutes />
            </WishlistProvider>
          </CartProvider>
        </UIProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
