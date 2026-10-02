# Validation

Checked on 2 October 2026 against the production build served under `/toy-car/`.

- **26 service tests**: bundles/coupons/totals, atomic checkout rollback, stock bounds, price snapshots, cancellation/refund idempotency, return window, tracking, OTP/profile, per-user wishlists, custom offer/coupon validation, CSV quoting/validation, offline retries/backoff, delayed stock pull and newer-stock precedence.
- **Desktop Chrome, 1440 × 1000**, and **mobile Chrome, 360 × 800**: storefront/search/filters/PIN delivery/zoom; WhatsApp bundle checkout (prefilled recipient, items, quantities, discounts, delivery details and pending payment); reload persistence; customer/admin timeline; cancellation stock restoration; inventory rejection/adjustment/log; Tally offline/retry/reconciliation; all admin pages and demo events/tour; manual and order-based bill generation, saved bills, optional future GST, original logo and old-data migration. Horizontal overflow and browser console/page errors are checked.
- **Firefox desktop** and **mobile WebKit**: the same six complete journeys passed in each engine; a Safari bill-editor intrinsic-width issue was corrected and retested. This is browser-engine testing, not a physical iOS device certification.
- **26 complete browser checks**: 14 Chrome checks (desktop/mobile, including accessibility) and 12 Firefox/WebKit journeys.
- **axe WCAG A/AA**: homepage, listing, product, account, dashboard, Tally and the new bill generator, plus keyboard skip navigation. Small white labels use a deeper red for sufficient contrast.
- **Lighthouse mobile (initial prototype, before this update)**: measured production homepage with simulated mobile throttling. The optimized audit reached **Performance 91 / Accessibility 100 / Best practices 96 / SEO 100**. Performance varies with device/load/network; this is a local measurement, not a hosted-site score. No claim of production accounting or payment correctness is made.
- **npm audit**: delivered dependency tree reports zero vulnerabilities after removing the temporary performance measurement package.
- `npm run build` passes TypeScript and generates the static deployment artifact. GitHub Actions also runs service tests before building/deploying.

Local screenshots and Lighthouse HTML/JSON reports are kept under ignored `test-results/` and `reports/` directories. They are review artifacts and not shipped with the site.

The supplied original JPEG logo is used unchanged in the header, footer and bills; file equality was checked against the attachment. The footer includes Designed by ShwaaS.ai. A generated non-GST bill was exported through Chrome to a single-page A4 PDF and its text/totals were inspected. Decimal bill calculations, rejected invalid inputs, stable saved tax totals and unpaid WhatsApp orders are covered by service tests.

WhatsApp tests inspect the generated link without sending a message. Opening WhatsApp prepares a message; the customer must tap Send. Bills, orders and business settings remain browser-local demo data. GST is off initially; the future toggle demonstrates a flat rate on discounted goods, not a full statutory invoice/tax implementation.
