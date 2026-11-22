# Tiny Kars local client demo guide

Verified: 22 November 2026

This guide is for the local client walkthrough only. The application uses the production React and
Fastify code with an on-disk PostgreSQL-compatible PGlite database. Razorpay, email, WhatsApp, R2
and Tally are **not live**. Payments are visibly labelled as local test payments.

## Local startup

Requires Node.js 22.14+ and npm 10+.

```sh
npm ci
npm run demo:client
```

Open **http://127.0.0.1:5173/**. The API is at `http://127.0.0.1:3001/api`; it is not the client
website.

`demo:client` applies every checksum-checked migration, seeds only on the first run, and stores data
in `.local/client-demo-db`. Stop with `Ctrl+C`; running the command again reuses orders, invoices,
stock and ledgers. For a clean demo without deleting the old data, stop the app, rename that folder
to a dated backup, and restart.

The demo is currently running on the standard URL. Readiness, restart persistence, sample images,
accounts and all three role paths were verified.

## Safe local demo accounts

These accounts exist only in the ignored local database. They are not production credentials and
must never be reused for deployment.

| Role           | Email                       | Local-only password  | Start page                      |
| -------------- | --------------------------- | -------------------- | ------------------------------- |
| Customer       | `collector@tinykars.local`  | `TinyKarsLocal!2026` | `/account/login`                |
| Seller         | `seller@tinykars.local`     | `TinyKarsLocal!2026` | `/account/login` → billing desk |
| Super admin    | `superadmin@tinykars.local` | `TinyKarsLocal!2026` | `/account/login` → `/admin`     |
| Admin          | `admin@tinykars.local`      | `TinyKarsLocal!2026` | `/account/login` → `/admin`     |
| Delivery staff | `staff@tinykars.local`      | `TinyKarsLocal!2026` | `/account/login` → order desk   |

Use a private window when switching roles, or sign out first. Use super admin to demonstrate every
management screen. Seller is deliberately restricted to counter billing.

## Customer demonstration

1. Open `/` and `/shop`. Public browsing is enabled locally, matching the original demo.
2. Use search and every database-backed filter: brand, series, scale/category, condition,
   manufacture year, price range, availability, rare models and offer. Show sorting, pagination and
   **Clear all**.
3. Open **Blue Sports Car**. Switch among five image views, zoom, check PIN `560001`, select quantity
   and add it to the cart.
4. Sign in as the collector. It has sample orders, a Bengaluru address, loyalty and store credit.
5. At checkout, use unused code `DEMO10` for 10% off orders of at least ₹499. `TINY10` was consumed
   by QA on order `TK-2026-1034`. Optionally apply store credit and at least 50 loyalty points.
6. Confirm the screen says **safe test-payment adapter** / **Place test order**. The backend
   recalculates price, voucher, shipping, stock, wallet and points. No real charge occurs.
7. Under **Account → My orders**, `TK-2026-1034` demonstrates confirmed test payment, voucher, ₹100
   credit and 50-point redemption. Its manager-issued invoice is `TK-2026-000034`.
8. Open the invoice. Both **Download invoice** (HTML) and **Print / Save PDF** are available.
9. Under **Rewards & credit**, the verified balance is 220 points and ₹378. The refund table includes
   the successful ₹228 store-credit refund for `TK-2026-1004`.

Signup and forgot-password screens work locally, but email delivery is disabled. Verification and
reset messages remain in the local outbox rather than going to real inboxes.

## Admin demonstration

Sign in as super admin and open `/admin`.

1. **Dashboard:** review KPIs, online/offline separation, charts, orders, shipping and Tally status.
2. **Products:** show the editor and five photo slots. Download the CSV template, import a unique
   test row, review validation/duplicates, then commit it. Imports remain drafts until reviewed.
3. **Inventory:** search by product/SKU, inspect movements and serial units, and optionally record a
   clearly described adjustment.
4. **Labels:** add a product or unit label and print the A4 sheet. SVG Code 128 values match the
   exact SKU/serial.
5. **Orders:** open `TK-2026-1034` to review immutable price snapshots and its online invoice.
6. **Offers & shipping:** show ₹79 delivery, free delivery from ₹1,499, `TINY10` and unused
   `DEMO10`. PIN-prefix zones are also supported.
7. **Loyalty & refunds:** show the active rule (2 points/₹100; ₹1/point; minimum 50), append-only
   ledgers and the successful refund for `TK-2026-1004`.
8. **Billing:** compare `TK-2026-000034` (online) and `TK-2026-000001` (offline), then print or
   download them.
9. **Tally:** show queued versioned exports. The UI correctly says not connected; no live export is
   attempted without approved mappings and connector configuration.
10. **Team & audit:** review roles, series prefixes and the searchable immutable audit log.

CSV repeat safety, SKU/barcode/serial uniqueness, label rendering and seller authorization were
also verified in the integration and desktop/mobile browser suites.

## Seller demonstration

1. Sign in as `seller@tinykars.local`. It redirects to `/admin/billing`; only **Billing desk** is in
   control-room navigation.
2. Scan or enter `482916-P000001` in **Catalogue model 1**. It resolves to **Blue Sports Car**,
   current database price ₹1,299 and shared stock.
3. Enter a walk-in customer, quantity and cash/UPI/card/bank-transfer method; click **Generate bill**.
4. Open the A4 invoice, print/save it and download the immutable HTML copy.
5. Existing UPI invoice `TK-2026-000001` reduced Blue Sports Car from 10 to 9; the online QA order
   then reduced it to 8. Three real billing-video recording passes reduced current stock to 5.
   All deductions are persistent; the enhanced video creates invoice `TK-2026-000070`.
6. Seller attempts to access products, inventory, offers, refunds, roles, Tally or online invoicing
   are denied by the backend. Sellers cannot adjust stock or alter issued invoices.

Offline payment methods are invoice snapshots, never online gateway confirmations.

## Sample products and barcodes

The database contains 61 published models (Blue Sports Car plus 60 sample models), each with five
local WebP views.

| Product            | SKU / barcode    | Notes                                       |
| ------------------ | ---------------- | ------------------------------------------- |
| Blue Sports Car    | `482916-P000001` | ₹1,299; easiest seller and checkout example |
| Mercedes-Benz 190E | `758486-P000001` | Rare/serial-tracked; Matchbox Chase, 1:64   |
| Pagani Huayra      | `543949-P000001` | Rare/serial-tracked; Tomica Chase, 1:18     |

Model barcode values are unique SKUs. Serial-tracked products also have unique per-unit codes under
**Inventory → Units** and **Labels**. Photos are labelled samples, not approved client photography.

## Test payment instructions

- Only use the button labelled **Place test order**. It uses the local trusted test adapter.
- The backend creates and prices the order, reserves stock, and confirms the local payment. Browser
  text alone is never treated as live payment confirmation.
- Managers issue online invoices after trusted confirmation. Customer invoice access is ownership
  checked by the API.
- Do not enter card details, bank passwords, UPI PINs, OTPs or live provider credentials.

## Verified workflows and tests

- Clean migrations and persistent financial/inventory records after a full stop/restart.
- All role accounts, route boundaries, catalogue filters, variants and five image views.
- Cart, shipping, voucher, test checkout, history, loyalty/wallet ledgers and invoice download.
- Offline seller sale, shared-stock deduction, invoice download and channel-separated reporting.
- Store-credit cancellation/refund, wallet ledger and inventory restock.
- CSV preview/validation/commit, identifiers, serials, labels, dashboards, delivery, Tally jobs and
  audit logs.
- Desktop and 360 px mobile customer/admin/seller screens without horizontal overflow or critical
  console errors.

Latest results: lint passed; both typechecks passed; 30 unit tests passed (36 database-only cases
skipped by that command); 66/66 integration tests passed; production build passed; 42 browser tests
passed with 6 intentional duplicate-state skips. Screenshots are in `artifacts/client-demo/` and
`artifacts/final-qa/`.

## Known limitations

- Local PGlite is for the portable demo. Production needs managed PostgreSQL and backup/restore.
- Razorpay, Resend, Meta WhatsApp, R2 and Tally are disabled/unconfigured. Outboxes and export jobs
  are test evidence, not provider delivery.
- Online invoices require manager issue after payment while statutory rules await approval.
- Automatic “Any 3 for ₹550” / “Buy 2, get 1 free” rules await eligibility and stacking decisions.
- Real catalogue/photos, physical printer/scanner, and real-device Safari/Android checks remain.
- Loyalty expiry awaits policy approval. Nothing is publicly deployed and live payments are off.

## Client approvals still required

1. Final catalogue, variations, prices, stock and five approved photos per product.
2. Browsing choice, delivery regions/rates/times, couriers, vouchers and bundle rules.
3. Loyalty value/expiry, stacking and refund/return policy.
4. Legal details, GSTIN, HSN/GST/place-of-supply, invoice and credit-note rules approved by the
   accountant.
5. TallyPrime company, ledger/voucher/stock mappings and Windows connector ownership.
6. Domain, hosting, managed PostgreSQL, backups, monitoring and secret management.
7. Client-owned Razorpay, Resend, Meta and R2 setup followed by provider staging acceptance.
8. Named production users, access review, printer/scanner model and client UAT on real devices.
