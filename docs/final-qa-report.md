# Tiny Kars final QA and security report

Verified: 22 November 2026 (Asia/Kolkata)

## Release decision

**Application decision: conditionally ready for client UAT and provider staging; not ready for live
payments or statutory production invoicing.** No reproducible critical application defect remains in
the locally testable scope. Live launch is blocked by client infrastructure and credentials,
accountant-approved tax/Tally mappings, authoritative catalogue media, native PostgreSQL backup and
restore acceptance, and provider sandbox/live drills.

This audit used the active React/Fastify/PostgreSQL application. The retained legacy prototype was
not treated as production evidence and its visual design was not changed.

## Defects reproduced and fixed in final QA

- Added a real TypeScript-aware ESLint gate with React Hooks rules. It found stale imports,
  incomplete effect dependencies, a barcode-label callback named like a hook, and dead media state;
  these are fixed and lint now passes with zero warnings.
- Prevented signed-out pages from making a protected catalogue-overview request. The UI previously
  handled the 401 silently, but Chromium still logged it as a console error.
- Replaced an invalid checkout phone `pattern` that Chromium rejected under current Unicode regular
  expression rules. The browser contract now matches the server's optional `+` plus 8–15 digits.
- Corrected seller-facing copy that implied access to online invoicing/settings even though backend
  authorization correctly restricted the seller to counter billing.
- Added browser-wide failure on uncaught page exceptions and console errors.
- Added explicit restart persistence verification for inventory and wallet-ledger records.
- Expanded catalogue regression coverage across series, scale, condition, minimum/maximum price,
  year, availability, rarity, offer, sorting and pagination.

## Requirement status

|   # | Verification area                | Status and executed evidence                                                                                                                                                                                                                |
| --: | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Frontend/backend startup         | **Pass.** `npm run dev:local` started Vite, Fastify and the database; frontend returned 200 and live/ready returned 200.                                                                                                                    |
|   2 | Clean migrations                 | **Pass locally.** All 20 checksum migrations applied to fresh PGlite/PostgreSQL-compatible databases in the integration and restart suites. Native PostgreSQL 16 CI was not observed.                                                       |
|   3 | Admin/customer/seller accounts   | **Pass.** Playwright global setup logged in customer, seller, staff, admin and super-admin accounts; role routes passed.                                                                                                                    |
|   4 | Signup/login/reset               | **Pass locally.** Registration, verification, login, logout, reset token use/reuse rejection, password change and throttling are integration-tested; live inbox delivery is untested.                                                       |
|   5 | Product browsing                 | **Pass.** Login-first and optional public browsing, home collections, catalogue, detail and empty/error states passed.                                                                                                                      |
|   6 | Original demo filters            | **Pass.** Search, brand, series, scale, condition, year, min/max price, stock, rarity, offer, sorting and pagination are now explicitly covered by API/browser regressions.                                                                 |
|   7 | Images/variants                  | **Pass locally.** Five slots, ordered gallery, zoom, upload validation/publish guard and database-backed variant switching passed; real R2 and client photos remain.                                                                        |
|   8 | Cart calculations                | **Pass.** Durable customer cart, quantity bounds and server price refresh passed; checkout never trusts browser totals.                                                                                                                     |
|   9 | Shipping                         | **Pass.** Flat/default rates, named PIN-prefix zones, free threshold, quote/recalculation and order snapshots passed.                                                                                                                       |
|  10 | Checkout/test payment            | **Pass in explicit test mode.** Pending/success/failure/cancel/idempotency and trusted confirmation passed. Production rejects test mode.                                                                                                   |
|  11 | Order history                    | **Pass.** Customer ownership, price snapshots, timeline, invoice reference and delivery tracking passed.                                                                                                                                    |
|  12 | CSV imports                      | **Pass.** Template, preview, row validation, duplicate detection, create/update, repeat safety, error summaries and review-required unnamed rows passed.                                                                                    |
|  13 | SKU/barcode/serial uniqueness    | **Pass.** Database constraints, generated series/product/unit codes, serial inventory and duplicate rejection passed. Product barcode value is the SKU.                                                                                     |
|  14 | Printable labels                 | **Pass for generated A4/SVG output.** Product/unit Code 128 routes and print sheet passed browser review. Physical printer/scanner acceptance is outstanding.                                                                               |
|  15 | Vouchers                         | **Pass.** Fixed/percentage, expiry, eligibility, global-once/once-per-customer, concurrency and abandoned-payment release passed.                                                                                                           |
|  16 | Loyalty                          | **Pass.** Earn/redeem, policy limits, idempotent awards, non-negative balance and refund/cancellation reversals passed.                                                                                                                     |
|  17 | Wallet/refunds                   | **Pass locally.** Append-only wallet, store-credit approval, source-refund boundary, duplicate prevention and ledger reversals passed. Live gateway refund drill remains.                                                                   |
|  18 | Admin/seller backend permissions | **Pass.** RBAC tests deny seller stock, online invoices, other sellers' invoices, settings, discounts, corrections, vouchers, refunds, roles and Tally.                                                                                     |
|  19 | Shared online/offline inventory  | **Pass.** Both paths lock and decrement the same catalogue stock; failures roll back and duplicate submissions do not decrement twice.                                                                                                      |
|  20 | Invoices/printing                | **Pass locally.** Sequential immutable snapshots, customer/business/item/tax/payment details, A4 print/save and authenticated HTML download passed. Accountant rules remain.                                                                |
|  21 | Delivery identity                | **Pass.** Shipped, out-for-delivery and delivered events retain authorized actor and timestamps, courier/tracking and recipient.                                                                                                            |
|  22 | Audit logging                    | **Pass.** Role/session, product, inventory, invoice and correction events use append-only audit records and manager-only search. Not every settings mutation has rich before/after metadata.                                                |
|  23 | Tally-ready approved mapping     | **Partial/external blocker.** `tiny-kars-tally-v1` sales/invoice/item/tax/payment payloads, leases, retries and unique references pass. No accountant-approved mapping or live TallyPrime bridge was supplied.                              |
|  24 | Desktop/mobile screens           | **Pass in Chromium.** Active customer/team screens passed at 1440×900 and 360×800 with overflow/accessibility checks. Physical Safari/iOS/Android acceptance remains.                                                                       |
|  25 | Visible actions                  | **Pass for active automated journeys and manual/static review.** Key navigation, forms, downloads and role actions were exercised. No intentionally inert production control was found; no exhaustive combinatorial click crawler was used. |
|  26 | Browser console                  | **Pass.** All 42 executed production journeys now fail on console errors/page exceptions; final run reported none.                                                                                                                          |
|  27 | Secret/banking exposure          | **Pass in repository scan.** No committed `.env`, real provider key, bank password, CVV or UPI PIN was found. Local demo credentials are explicitly non-production.                                                                         |
|  28 | Integration mode labels          | **Pass.** `/api/config` reported `paymentMode: test`; production rejects that mode. Email, WhatsApp, R2 and Tally remain fail-closed/unconfigured without complete secret groups.                                                           |
|  29 | Restart persistence              | **Pass locally.** The new verifier closed and reopened an on-disk database/API and retained stock 7, one movement, wallet ₹123.45 and 20 migration records. Managed PostgreSQL backup/restore remains untested.                             |
|  30 | Automated regressions            | **Pass.** Lint, types, 30 default tests, 66 database tests, persistence restart, production build and 42 browser journeys are repeatable scripts.                                                                                           |

## Local startup

Prerequisites: Node.js 22.14+, npm 10+, and no production `.env` variables in the shell.

```sh
npm ci
npm run dev:local
```

Open `http://127.0.0.1:5173`. The local command runs the production React/Fastify code with a
temporary seeded PGlite database and prints its URLs. Its data is intentionally erased on stop.

For persistent PostgreSQL development:

```sh
cp server/env.example .env
# Set DATABASE_URL, OUTBOX_ENCRYPTION_KEY, PUBLIC_WEB_URL and ALLOWED_ORIGINS.
npm run db:migrate
npm run dev:api
npm run dev
```

Do not copy real provider credentials into source files. Use the deployment secret manager.

## Local demo accounts

These accounts and the shared password exist only in `dev:local` and Playwright's disposable
database; they are not production secrets.

```text
Password: TinyKarsLocal!2026
collector@tinykars.local   customer with sample orders
seller@tinykars.local      counter billing only
staff@tinykars.local       delivery updates only
admin@tinykars.local       manager operations
superadmin@tinykars.local  configuration and role owner
```

## Completed API inventory

The list below was extracted from `/api/openapi.json` on the running application (95 operations).

### Operations, identity and customer account

```text
GET  /api/health/live                 GET    /api/health/ready
GET  /api/config                      GET    /api/openapi.json
POST /api/auth/register               POST   /api/auth/login
POST /api/auth/logout                 GET    /api/auth/me
POST /api/auth/forgot-password        POST   /api/auth/reset-password
POST /api/auth/verify-email           GET    /api/account/profile
PUT  /api/account/profile             POST   /api/account/password
GET  /api/account/addresses           POST   /api/account/addresses
PUT  /api/account/addresses/{id}      DELETE /api/account/addresses/{id}
GET  /api/wishlist                    PUT    /api/wishlist/{id}
DELETE /api/wishlist/{id}             PUT    /api/restock-alerts/{id}
```

### Catalogue, cart and checkout

```text
GET  /api/products                    GET    /api/products/{id}
GET  /api/products/overview           GET    /api/cart
PUT  /api/cart                        DELETE /api/cart
POST /api/shipping/quote              POST   /api/vouchers/preview
POST /api/checkout/quote              POST   /api/checkout/orders
POST /api/test-payments/{id}/{action} POST   /api/webhooks/razorpay
GET  /api/orders                      GET    /api/orders/{id}
GET  /api/orders/{id}/invoice         POST   /api/orders/{id}/requests
GET  /api/finance
```

### Product, inventory and import administration

```text
GET  /api/admin/products                       POST /api/admin/products
GET  /api/admin/products/{id}                  PATCH /api/admin/products/{id}
POST /api/admin/products/{id}/publish          POST /api/admin/products/{id}/archive
POST /api/admin/products/{id}/stock            PUT /api/admin/products/{id}/images/{slot}
GET  /api/admin/products/{id}/units            GET /api/admin/products/{id}/label.svg
GET  /api/admin/units/{id}/label.svg           GET /api/admin/products/export.csv
POST /api/admin/imports                        GET /api/admin/imports/{id}
POST /api/admin/imports/{id}/commit            GET /api/admin/inventory/movements
GET  /api/admin/series-codes
```

### Orders, customers, finance and configuration

```text
GET  /api/admin/dashboard                      GET /api/admin/orders
GET  /api/admin/orders/{id}                    POST /api/admin/orders/{id}/status
POST /api/admin/order-requests/{id}/resolve    GET /api/admin/customers
GET  /api/admin/customers/{id}                 GET /api/admin/audit-logs
POST /api/admin/users/assign-role              GET /api/admin/shipping-policies
POST /api/admin/shipping-policies              POST /api/admin/shipping-policies/{id}/activate
GET  /api/admin/vouchers                       POST /api/admin/vouchers
POST /api/admin/vouchers/{id}/disable          GET /api/admin/loyalty-policies
POST /api/admin/loyalty-policies               POST /api/admin/loyalty-policies/{id}/activate
GET  /api/admin/finance-customers              POST /api/admin/loyalty-adjustments
POST /api/admin/wallet-adjustments             GET /api/admin/refunds
POST /api/admin/refunds                        POST /api/admin/refunds/{id}/refresh
```

### Billing and Tally

```text
GET  /api/billing/products                     GET /api/billing/settings/active
GET  /api/billing/invoices                     POST /api/billing/invoices
GET  /api/billing/invoices/{id}                GET /api/billing/invoices/{id}/download
GET  /api/billing/eligible-orders              GET /api/admin/billing-settings
POST /api/admin/billing-settings               POST /api/admin/billing-settings/{id}/activate
POST /api/admin/billing/invoices/{id}/corrections
GET  /api/admin/tally-jobs                     POST /api/admin/tally-jobs/{id}/retry
POST /api/connectors/tally/claim               POST /api/connectors/tally/{id}/complete
```

## Database model inventory

The migration runner also owns `schema_migrations`. Application tables are grouped below.

- Identity: `identity_users`, `identity_roles`, `identity_sessions`, `identity_tokens`,
  `identity_throttle`, `identity_outbox`, `identity_audit_log`, plus retained dormant
  `identity_mfa` and `identity_mfa_pending` tables from the superseded MFA implementation.
- Catalogue/inventory: `catalogue_products`, `catalogue_product_images`, `catalogue_brands`,
  `catalogue_series`, `catalogue_series_codes`, `catalogue_variant_groups`,
  `catalogue_product_variants`, `catalogue_import_jobs`, `catalogue_import_rows`,
  `catalogue_restock_requests`, `inventory_units`, `inventory_movements`.
- Customer/commerce: `customer_addresses`, `customer_wishlist`, `commerce_carts`,
  `commerce_cart_items`, `commerce_orders`, `commerce_order_items`, `commerce_order_item_units`,
  `commerce_order_events`, `commerce_order_requests`, `commerce_shipping_policies`,
  `commerce_vouchers`, `commerce_voucher_redemptions`, `commerce_payment_events`,
  `commerce_payments`, `commerce_notification_outbox`, `commerce_loyalty_policies`,
  `commerce_loyalty_entries`, `commerce_wallet_entries`, `commerce_refunds`.
- Billing: `billing_settings`, `billing_invoices`, `billing_invoice_items`,
  `billing_invoice_item_units`, `billing_invoice_corrections`, `billing_tally_jobs`.

## Executed tests

| Command/check                    | Fresh result                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run lint`                   | Passed, zero warnings                                                                             |
| `npm run check`                  | Passed, frontend strict TypeScript                                                                |
| `npm run check:server`           | Passed, server strict TypeScript                                                                  |
| `npm test`                       | 30 passed, 36 database-dependent skips                                                            |
| `npm run test:integration:local` | 66/66 passed on a fresh migrated database                                                         |
| `npm run verify:persistence`     | Passed after full close/reopen; stock, movement and wallet ledger retained; 20 migrations present |
| `npm run build`                  | Passed; 2,251 modules transformed                                                                 |
| `npm run test:production-ui`     | 42 passed, 6 deliberate project skips; desktop/mobile, console/page-error gate active             |
| `npm audit --omit=dev`           | Passed; zero reported production vulnerabilities                                                  |
| `npm run format:check`           | Passed after final formatting                                                                     |
| `git diff --check`               | Passed                                                                                            |

The six browser skips avoid repeating one-way shared-database mutations in both projects and avoid
running mobile-only layout checks in the desktop project; they are intentional, not failed flows.

## Screenshots

- [Seller billing — desktop](../artifacts/final-qa/seller-billing-desktop.png)
- [Seller billing — mobile](../artifacts/final-qa/seller-billing-mobile.png)
- [Issued offline invoice — desktop](../artifacts/final-qa/offline-invoice-desktop.png)
- [Issued offline invoice — mobile](../artifacts/final-qa/offline-invoice-mobile.png)

## Remaining issues and external blockers

### Critical/high

- None reproduced in the locally testable application scope.

### Medium — launch blockers

- Accountant approval is missing for GST/HSN/place-of-supply, invoice/credit-note numbering and
  Tally company, voucher type, ledger, stock-item and tax mappings.
- Razorpay sandbox/live credentials, webhook configuration, settlement reconciliation and live
  refund drill are not supplied or tested.
- Resend sender-domain/inbox delivery, Meta WhatsApp sender/template/status delivery, R2 media and
  the Windows TallyPrime bridge are not configured or acceptance-tested.
- Managed native PostgreSQL 16, migration deployment, monitoring, alerting, log retention and
  backup/restore disaster recovery were not available. Local clean migration and PGlite on-disk
  restart passed but do not replace a managed-database restore drill.
- Real client catalogue names/variations/five-view photographs and physical barcode
  printer/scanner acceptance remain outstanding.

### Low

- Older documents and the retained legacy prototype contain historical claims/counts. This report
  and `PROJECT_PROGRESS.md` are authoritative for the active production entry point.
- Dormant MFA tables remain from an earlier requirement, although no production route/UI uses MFA.
- Physical iOS Safari/Android hardware was not available; responsive Chromium emulation passed.

## External configuration still required

- Core: `DATABASE_URL`, stable `OUTBOX_ENCRYPTION_KEY`, HTTPS `PUBLIC_WEB_URL`, and
  `ALLOWED_ORIGINS`.
- Email: `RESEND_API_KEY`, `EMAIL_FROM` and a verified sending domain.
- Payments: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- Media: all five R2 settings (`MEDIA_PUBLIC_BASE_URL`, endpoint, key ID, secret and bucket).
- WhatsApp: Meta token, phone-number ID, approved template name/language and webhook/status plan.
- Tally: high-entropy connector secret plus accountant-approved mappings and client-owned Windows
  connector/host.
- Infrastructure: managed PostgreSQL, backups, restore drills, HTTPS routing, deployment secrets,
  monitoring, alerting and retention policies.

## Working demo checklist

1. Install Node 22.14+ and run `npm ci`.
2. Run `npm run dev:local`; confirm the printed website/API URLs.
3. Sign in as the customer; browse, apply all filters, open five views/variants, add to cart and use
   `TINY10` in checkout.
4. Place the clearly labelled local test payment and open order history/invoice/rewards.
5. Sign in as super admin; review dashboard, products, CSV preview/import, inventory, labels,
   shipping, vouchers, loyalty, refunds, orders, audit and Tally queue.
6. Sign in as seller; scan `482916-P000001`, create a counter invoice, print/save/download it and
   confirm seller-only navigation.
7. Sign in as staff; progress the prepared sample order through delivery and verify actor/timeline.
8. Run `npm run lint`, `npm run check`, `npm run check:server`, `npm test`,
   `npm run test:integration:local`, `npm run verify:persistence`, `npm run build`, and
   `npm run test:production-ui`.
9. Review the four current screenshots above.
10. Do not enable live providers or issue statutory invoices until every medium blocker has owner
    sign-off and staging acceptance evidence.
