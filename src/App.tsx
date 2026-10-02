import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { UIProvider, Loading, Empty } from './components/UI';
import { Layout } from './components/Layout';
import Demo from './components/Demo';
import { processJobs } from './services/tallySync';
const Home = lazy(() => import('./pages/Home')),
  Shop = lazy(() => import('./pages/Shop')),
  Product = lazy(() => import('./pages/Product')),
  Cart = lazy(() => import('./pages/Cart')),
  Checkout = lazy(() => import('./pages/Checkout')),
  Account = lazy(() => import('./pages/Account')),
  Wishlist = lazy(() => import('./pages/Account').then((m) => ({ default: m.Wishlist }))),
  OrderDetail = lazy(() => import('./pages/OrderDetail')),
  AdminDashboard = lazy(() => import('./pages/AdminDashboard')),
  AdminProducts = lazy(() => import('./pages/AdminProducts')),
  AdminInventory = lazy(() => import('./pages/AdminInventory')),
  AdminOrders = lazy(() => import('./pages/AdminOrders')),
  AdminBilling = lazy(() => import('./pages/AdminBilling')),
  AdminCustomers = lazy(() => import('./pages/AdminCustomers')),
  AdminOffers = lazy(() => import('./pages/AdminOffers')),
  AdminTally = lazy(() => import('./pages/AdminTally')),
  Features = lazy(() => import('./pages/Features'));
export default function App() {
  useEffect(() => {
    const id = setInterval(() => processJobs(), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <HashRouter>
      <UIProvider>
        <Layout>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/product/:id" element={<Product />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/account/*" element={<Account />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/order/:id" element={<OrderDetail />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/products" element={<AdminProducts />} />
              <Route path="/admin/inventory" element={<AdminInventory />} />
              <Route path="/admin/billing" element={<AdminBilling />} />
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/orders/:id" element={<OrderDetail />} />
              <Route path="/admin/customers" element={<AdminCustomers />} />
              <Route path="/admin/offers" element={<AdminOffers />} />
              <Route path="/admin/tally" element={<AdminTally />} />
              <Route path="/features" element={<Features />} />
              <Route
                path="*"
                element={
                  <div className="container page">
                    <Empty title="Wrong turn?" detail="Your next collectible is one click away.">
                      <Link className="btn btn-primary" to="/">
                        Back to the garage
                      </Link>
                    </Empty>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </Layout>
        <Demo />
      </UIProvider>
    </HashRouter>
  );
}
