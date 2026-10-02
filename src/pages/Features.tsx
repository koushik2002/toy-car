import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Sparkles } from 'lucide-react';
const groups = [
  {
    title: 'THE COLLECTOR EXPERIENCE',
    items: [
      [
        'Storefront',
        'Hero, fresh drops, best sellers, rare carousel, brands, scales, budgets and trust strips.',
        '/',
      ],
      [
        'Explore the collection',
        'Live filters, series, price range, stock/rare/condition options, sorting and mobile filter drawer.',
        '/shop',
      ],
      [
        'Product close-up',
        'Gallery zoom, stock, quantity, wishlist, sold-out reminder, PIN delivery and related models.',
        '/product/p001',
      ],
      ['Search', 'Instant header suggestions and a full results page.', '/shop?q=Nissan'],
      [
        'Bundles & coupons',
        'Cart drawer/page, any 3 for ₹550, buy 2 get 1, coupon TINY10, free-shipping progress.',
        '/shop?offer=bundle',
      ],
      [
        'Checkout',
        'Indian addresses, WhatsApp order messages, payment arranged with the shop and stock updates.',
        '/checkout',
      ],
    ],
  },
  {
    title: 'YOUR COLLECTOR ACCOUNT',
    items: [
      [
        'Mock login',
        'Choose a demo collector or enter an Indian phone number with Demo OTP 123456.',
        '/account',
      ],
      [
        'Orders & invoices',
        'Status filters, detailed timeline, price snapshots, tracking, printable invoice and reorder.',
        '/account',
      ],
      [
        'Cancel & return',
        'Cancel before packing with stock restoration. Seven-day returns with reason and photo preview.',
        '/account',
      ],
      ['Wishlist', 'Save collectibles and add them to your garage later.', '/wishlist'],
      [
        'Saved addresses & profile',
        'Create, edit and delete delivery addresses; update name/email.',
        '/account/addresses',
      ],
    ],
  },
  {
    title: 'BEHIND THE GARAGE DOORS',
    items: [
      [
        'Bill generator',
        'Create and save bills, print or save as PDF, and configure optional future GST.',
        '/admin/billing',
      ],
      ['Admin dashboard', 'Six KPIs, 30-day order chart, brand sales and recent orders.', '/admin'],
      [
        'Product management',
        'Search/filter; add, edit, delete; image preview; validated CSV import/export.',
        '/admin/products',
      ],
      [
        'Inventory',
        'SKU stock, adjustable alert thresholds, signed stock changes, reason and audit log.',
        '/admin/inventory',
      ],
      [
        'Order operations',
        'Advance fulfilment, courier/tracking, COD collected and mocked refunds.',
        '/admin/orders',
      ],
      [
        'Collectors',
        'Search customers, lifetime order value, full order history and saved addresses.',
        '/admin/customers',
      ],
      [
        'Offers & coupons',
        'Edit and enable bundle offers; create/edit/enable coupon codes.',
        '/admin/offers',
      ],
    ],
  },
  {
    title: 'THE TALLY SIMULATION',
    items: [
      [
        'Connection & sync jobs',
        'Simulated bridge, offline switch, configurable failures, sales/stock jobs and sync history.',
        '/admin/tally',
      ],
      [
        'Retries & backoff',
        'Manual retry, retry all, automatic exponential backoff and visible countdowns.',
        '/admin/tally',
      ],
      [
        'Stock pull & reconciliation',
        'Different Tally stock snapshot, compare SKUs and accept either side with inventory logging.',
        '/admin/tally',
      ],
      [
        'SKU mapping',
        'Edit SKU → Tally item names locally. No real Tally connection or XML.',
        '/admin/tally',
      ],
    ],
  },
];
export default function Features() {
  return (
    <div className="container page features-page">
      <div className="page-heading">
        <span className="eyebrow red">THE COMPLETE DEMO MAP</span>
        <h1>
          TAKE EVERY FEATURE
          <br />
          FOR A <em>TEST DRIVE.</em>
        </h1>
        <p>
          Browse like a collector. Operate like a store owner.
          <br />
          Use the floating Demo button for a guided tour, events, account switches, and reset.
        </p>
        <span className="feature-demo">
          <Sparkles size={16} /> Static prototype · browser data · no real payments or Tally
          connection
        </span>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="feature-section">
          <h2>{g.title}</h2>
          <div className="features-grid">
            {g.items.map(([name, detail, path]) => (
              <Link className="feature-card" key={name} to={path}>
                <span>
                  <Check size={18} />
                </span>
                <div>
                  <h3>{name}</h3>
                  <p>{detail}</p>
                  <b>
                    Try it <ArrowUpRight size={15} />
                  </b>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <div className="notice">
        All changes persist in localStorage with a memory fallback. Use Reset demo data to start
        fresh. Data and role switching are for presentation and do not provide real authentication.
      </div>
    </div>
  );
}
