# Tiny Kars

A premium, fully client-side Indian diecast store **sales prototype** for `koushik2002/toy-car`. Charcoal surfaces, a racing-red action colour, yellow collector highlights, and electric-blue details follow the supplied Tiny Kars logo direction.

## Run it

Requires Node.js 22.14+ and npm.

```sh
npm ci
npm run dev
```

Open the address Vite prints, including `/toy-car/`. For the production build:

```sh
npm run build
npm run preview
```

Use **Demo** in the bottom-right corner to start a 12-step walkthrough, switch collector/admin views, trigger new orders/low stock/offline Tally/failed syncs, or reset all browser data. `/#/features` is the complete clickable feature map.

## Demo accounts

The initial session is Arjun, so a presentation can begin immediately. Open Account and “Switch demo collector” to choose another user, or sign out to try phone + OTP.

| Collector    | Phone      | City       |
| ------------ | ---------- | ---------- |
| Arjun Mehta  | 9876500001 | Bengaluru  |
| Priya Sharma | 9876500002 | Mumbai     |
| Karthik Rao  | 9876500003 | Hyderabad  |
| Admin        | 9876500099 | Admin demo |

Any valid Indian mobile number works with **Demo OTP `123456`**, displayed on screen. No SMS is sent. Switch to admin with the header's **Admin demo** button or the floating Demo panel. Direct admin links intentionally work; this is role simulation, not authentication.

Coupons: `TINY10` (10%, ₹499 minimum), `FIRST15` (15%, ₹999 minimum), and initially disabled `COLLECT5` (5%). Prices use INR and Indian grouping; GST on goods is shown at a fixed **demo 18%**, not a production tax calculation. Shipping is ₹79, free above ₹1,499 **after discounts**.

## What you can demonstrate

- Home: cinematic hero, local artwork, brand/series mega-menu, scales, budgets, starter offer, new arrivals, best sellers, rare carousel and trust strips.
- Catalogue: URL-based filters for brand, series, scale, price ceiling, condition, stock, rarity and offer; sorting, active chips, mobile drawer, simulated 350 ms skeleton state and header search suggestions.
- Product: three presentations of illustrative artwork, zoom, quantity, stock states, wishlist, local restock reminder, related items and mocked six-digit PIN-code delivery.
- Cart/checkout: drawer and page, add animation/toasts, automatic bundles, coupon, shipping progress, saved/new address, UPI/Card/COD and fake payment failure/success. Orders atomically validate/decrement stock, preserve item prices and queue sales/stock jobs.
- Account: per-collector wishlist, profile, saved addresses, order filters, fulfilment timeline, tracking, printable **demo invoice**, reorder, cancel before packing, returns within seven days, optional local photo preview. Cancellation/refund restores stock once.
- Admin: six KPIs, 30-day chart, brand item-sales chart, product CRUD/image preview, validated CSV import/export, stock adjustment reasons/thresholds/logs, fulfilment/tracking/COD/refund controls, customer histories/LTV, editable and creatable offers/coupons.
- Tally: offline/online switch, company and last-sync time, configurable 15% default failure, pending/success/failed jobs, manual/all-failed retry, exponential backoff, stock pull, reconciliation accepting either source with an inventory log, editable SKU mappings. A late retry cannot replace a newer successful stock update.
- Demo: guided customer → admin → Tally journey, event buttons, account switches, reset, and clickable feature map.

There are 60 local products across nine brands, three collectors, one admin, 25 historical orders covering all statuses, 25 inventory movements, and 25 initial sync jobs. Dates are relative to the first load/reset so dashboards and return examples stay usable. Historical movements/orders are presentation seed history; they do not replay against initial stock.

## GitHub Pages

The actual selected repository is **`toy-car`**, so `vite.config.ts` sets **`base: '/toy-car/'`**. `HashRouter` keeps deep links and refreshes valid on static hosting:

```text
https://koushik2002.github.io/toy-car/
https://koushik2002.github.io/toy-car/#/product/p001
https://koushik2002.github.io/toy-car/#/admin/tally
```

These are the expected URLs **after deployment**, not proof that Pages has been enabled.

`.github/workflows/deploy.yml` runs `npm ci`, service tests and the production build on each push to `main`, uploads `dist`, and deploys with the GitHub Pages environment. In the repository's **Settings → Pages**, choose **GitHub Actions** as the source. The authenticated repository owner must enable Pages if it has not been enabled. No deployment secrets or API keys are required.

The intended git publication is:

```sh
git push origin main
```

GitHub account access is required for pushing and enabling Pages. Cloning a public repository does not grant write access.

## Logo, colours and artwork

Replace **`public/assets/brand/logo.png`** with the exact supplied logo. The chat attachment was visible as a design reference but was not available as a local image file, so this file currently contains a temporary Tiny Kars wordmark. The SVG sibling is its source. The header/footer consume the same PNG path.

All brand tokens are in the `:root` blocks of **`src/styles.css`**; Tailwind tokens are in the adjacent `@theme` block. `--red-action` is slightly deeper than the accent red to meet contrast requirements for white button text.

Images are original generated **illustrative placeholders**, stored locally as WebP with smaller responsive versions. Nine catalogue illustrations repeat across the 60 seeded models; they do not claim to accurately depict every named product. The gallery uses crops of the same placeholder, not three real product photographs. No product images or text were copied from the reference stores. See **`docs/artwork.md`** for the generation prompts and asset paths.

## Code map

```text
src/components/   shared layout, cards, dialogs, demo controls, forms
src/pages/        lazy-loaded customer and admin screens
src/services/     storage, cart, orders, inventory, Tally, account, offers, CSV
src/data/         local JSON seeds and relative-date seed construction
src/hooks/        reactive state subscription
public/assets/    local brand, hero and product artwork
tests/unit/      business transaction/retry/CSV tests
tests/e2e/       desktop/mobile journeys and accessibility scans
```

One storage service wraps localStorage reads/writes in try/catch and falls back to memory with a visible notice if storage is unavailable or full. State uses a single versioned document and immutable transactions, with cross-tab storage-event updates. Concurrent writes from separate tabs use last-write-wins; a production backend must handle real concurrency.

## Verification

```sh
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
npx playwright test -c playwright.compat.config.ts
```

The normal Playwright configuration uses installed Chrome on macOS if found and Playwright Chromium elsewhere. You can set `TINY_KARS_CHROME` to an executable path. Compatibility projects use Firefox and mobile WebKit. WebKit emulation is not a physical iPhone Safari test. Lighthouse and accessibility findings are documented in **`docs/validation.md`**.

## Simulated vs production

This prototype has no backend, database, payment gateway, real OTP, accounting bridge, analytics, real delivery lookup or real notification service. It does not collect card/bank credentials. Photo uploads are resized and saved in browser state, not sent anywhere. Browser data is local to each device, and reset restores the seed.

Production would need server authentication/authorization, a transactional inventory/order database, validated addresses, a payment gateway with verified webhooks, delivery/carrier integration, actual tax/invoice configuration, secure upload storage, notifications, and a TallyPrime connector with durable jobs, accounting identifiers, idempotency and reconciliation. No real Tally XML or tax identifiers are invented here.
