# Validation

Checked on 2 October 2026 against the production build served under `/toy-car/`.

- **20 service tests**: bundles/coupons/totals, atomic checkout rollback, stock bounds, price snapshots, cancellation/refund idempotency, return window, tracking, OTP/profile, per-user wishlists, custom offer/coupon validation, CSV quoting/validation, offline retries/backoff, delayed stock pull and newer-stock precedence.
- **Desktop Chrome, 1440 × 1000**, and **mobile Chrome, 360 × 800**: storefront/search/filters/PIN delivery/zoom; bundle checkout including failed payment and successful payment; reload persistence; customer/admin timeline; cancellation stock restoration; inventory rejection/adjustment/log; Tally offline/retry/reconciliation; all admin pages and demo events/tour. Horizontal overflow and browser console/page errors are checked.
- **Firefox desktop** and **mobile WebKit**: the same four complete journeys passed in each engine. This is browser-engine testing, not a physical iOS device certification.
- **18 complete browser checks**: 10 Chrome checks (desktop/mobile, including accessibility) and eight Firefox/WebKit journeys.
- **axe WCAG A/AA**: homepage, listing, product, account, dashboard and Tally, plus keyboard skip navigation. Small white labels use a deeper red for sufficient contrast.
- **Lighthouse mobile**: measured production homepage with simulated mobile throttling. The optimized audit reached **Performance 91 / Accessibility 100 / Best practices 96 / SEO 100**. Performance varies with device/load/network; this is a local measurement, not a hosted-site score. No claim of production accounting or payment correctness is made.
- **npm audit**: delivered dependency tree reports zero vulnerabilities after removing the temporary performance measurement package.
- `npm run build` passes TypeScript and generates the static deployment artifact. GitHub Actions also runs service tests before building/deploying.

Local screenshots and Lighthouse HTML/JSON reports are kept under ignored `test-results/` and `reports/` directories. They are review artifacts and not shipped with the site.

The supplied exact logo still needs to replace the local temporary wordmark. GitHub publication requires an authenticated write-capable account; public repository cloning does not verify this.
