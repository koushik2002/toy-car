# Tiny Kars project progress

Last verified: 22 November 2026

## Foundation status

The repository has a real production application; it is not only the original browser demo.
The active entry point (`src/main.tsx`) loads the production React application in
`src/production/`. That frontend talks to a Fastify API in `server/`, and the API persists
business data in PostgreSQL through `pg`.

Production persistence is real: API startup requires `DATABASE_URL`, runs checksum-protected SQL
migrations, and fails when the database or required secrets are unavailable. Local review and the
integration suite intentionally use a temporary PGlite database, so data created by
`npm run dev:local` is erased when that command stops. The legacy browser/localStorage prototype
still exists under `src/pages`, `src/components`, `src/services`, and `src/data` as the visual and
behavioural reference, but it is not imported by the production entry point or production bundle.

The original demo appearance was reviewed from the legacy React source, shared stylesheet, and
the stored desktop/mobile reference captures. The production storefront retains its dark garage
theme, yellow/red accents, condensed display typography, hero composition, catalogue cards,
control-room layout, and responsive behaviour. No visual redesign was made during this foundation
pass.

## Current architecture

| Layer                     | Current implementation                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer and team web app | React 19, TypeScript, Vite, React Router; production routes live in `src/production/App.tsx`                                                                                             |
| Legacy visual reference   | Original HashRouter/localStorage prototype retained in `src/App.tsx` and the non-production `src/pages`, `src/components`, and `src/services` trees                                      |
| API                       | Fastify modular monolith with runtime request schemas, generated OpenAPI, CORS, rate limiting, redacted structured logging, and health endpoints                                         |
| Authentication            | Argon2id passwords, email verification/reset tokens, encrypted email outbox, HTTP-only sessions, origin and CSRF checks, role-bound session invalidation, and server-side RBAC           |
| Database                  | PostgreSQL with normalized roles, brands, series, variants, durable carts/payments, serial snapshots and ordered checksum migrations; PGlite is limited to disposable local review/tests |
| Media                     | Five ordered image slots and an S3-compatible R2 adapter; provider configuration is optional and validated as a complete group                                                           |
| Commerce                  | Server-priced named shipping zones, immutable order snapshots, gateway abstraction, trusted local payments, vouchers, ledgers, fulfilment, refunds and durable notification outboxes     |
| Billing/accounting        | Immutable online/offline invoices, seller-owned counter billing, append-only corrections, barcode labels, downloads, and durable versioned Tally export jobs                             |
| Deferred providers        | Razorpay, Resend, Meta WhatsApp, R2, and Tally are disabled/fail-closed without complete credentials; transport boundaries are covered by local tests where implemented                  |

### Active route groups

- Customer: home, catalogue, product, cart, checkout, wishlist, registration/login/recovery,
  profile, addresses, security, order history, order detail, and invoice.
- Team: dashboard, products, inventory, orders, customers, offers/shipping, finance, billing,
  Tally jobs, labels, and team/series codes.
- API: health/config/OpenAPI, identity, catalogue/media/imports, inventory, shipping/vouchers,
  checkout/webhooks, orders/fulfilment, finance/refunds, billing/invoices, storefront account data,
  and Tally connector jobs.

No broken imports or active route/API mismatches were found by TypeScript, production build, API
integration tests, or browser journeys. Seller, staff, admin, super-admin, and customer boundaries
are enforced by the API in addition to frontend navigation.

## Requirements-versus-code checklist

| Requirement                               | Status                                              | Evidence or remaining work                                                                                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer signup/login/password reset      | Foundation complete                                 | Verification, reset, login/logout, session revocation, CSRF, throttling, and browser flows are implemented. Live email delivery is deferred.                                                                                            |
| Customer product catalogue and filtering  | Foundation complete                                 | Search, brand, series, scale, condition, year, price, stock, rarity, offer, and sorting are server-backed and URL-shareable.                                                                                                            |
| Product images up to five views           | Foundation complete                                 | Five ordered slots, upload validation, publish guard, gallery, zoom, and sample images exist. Live R2 acceptance and real photography remain.                                                                                           |
| Product name, brand, price, year, series  | Complete                                            | Separate database/API/admin/CSV fields exist.                                                                                                                                                                                           |
| Product variants                          | Customer stage complete                             | Explicit variation groups return separate sellable SKUs with their own price, stock, imagery and labels; the product page switches between them without hardcoded frontend data.                                                        |
| Shopping cart and configurable shipping   | Commerce stage complete                             | Durable customer carts, flat/named PIN-prefix zones, optional free thresholds, pre-order quotes, server recalculation, and immutable order shipping snapshots exist.                                                                    |
| Checkout and order history                | Commerce stage complete, live provider deferred     | Reservations, immutable totals, discounts, wallet/loyalty, history, tracking, explicit local payment states and webhook reconciliation exist. Live Razorpay remains credential-gated.                                                   |
| Admin dashboard                           | Foundation complete                                 | Real database KPIs, charts, latest orders, navigation, and role restrictions are browser-tested.                                                                                                                                        |
| Product CRUD and CSV bulk upload          | Backend/admin stage complete                        | Draft/edit/publish/archive, staged create/update preview, row validation, repeat-safe commit, review-required identifiers, variations, summaries and export exist.                                                                      |
| Unique SKU, barcode, optional unit serial | Foundation complete                                 | Unique database constraints, series prefixes, product codes, serial-tracked units, and Code 128 labels exist.                                                                                                                           |
| Printable barcode labels                  | Foundation complete                                 | Product and unit SVG label routes and responsive A4 label sheet UI exist; physical printer/scanner acceptance remains.                                                                                                                  |
| Seller login with restricted billing      | Seller billing stage complete                       | Seller has a one-screen billing desk and minimal SKU/barcode catalogue lookup, sees only self-issued counter invoices, and is denied online billing, settings, corrections, stock, voucher, refund and role powers.                     |
| Online/offline order separation           | Seller billing stage complete                       | Persisted channels, separate admin reporting and payment records distinguish online gateway orders from offline cash/UPI/card/bank sales while sharing one row-locked inventory.                                                        |
| Invoice generation                        | Seller billing complete; accounting rules pending   | Immutable sequential A4 invoices include business/customer/items/HSN/tax/payment snapshots, printable/downloadable HTML, physical serials and append-only correction records. Accountant rules remain.                                  |
| Discounts and single-use vouchers         | Foundation complete                                 | Fixed/percentage vouchers, limits, atomic redemption, manual admin discount, and seller restrictions exist.                                                                                                                             |
| Loyalty points                            | Commerce stage complete                             | Configurable earn/redeem rules, non-negative balance checks, append-only history, idempotent awards and full-refund restoration/reversal exist.                                                                                         |
| Refunds and store-credit wallet           | Commerce stage complete, provider deferred          | Customer consent preference, admin approval/rejection, idempotent store-credit issuance, ledger restoration and future source-refund boundary exist. Live Razorpay refunds remain deferred.                                             |
| Staff delivery confirmation               | Commerce stage complete                             | Shipped, out-for-delivery and delivered transitions record staff identity/timestamps, courier/tracking, recipient evidence, history and notifications.                                                                                  |
| Admin activity/audit logs                 | Backend/admin stage complete                        | Append-only rows, indexed manager-only search API, responsive control-room UI and before/change metadata for product and stock updates exist.                                                                                           |
| Tally-ready accounting exports            | Export architecture complete; live mapping deferred | Every invoice receives one durable job and versioned sale/customer/item/tax/payment payload with a unique export reference, leases, retries and duplicate external-reference protection. Accountant mappings and Windows bridge remain. |
| Future payment adapter                    | Test adapter complete; live deferred                | A gateway interface isolates Razorpay. The non-production provider persists pending/success/failure/cancel states and queues local outbox records only after trusted confirmation; production rejects test mode.                        |
| Future email adapter                      | Partial/fail-closed                                 | Durable encrypted outboxes, retry/lease logic, and Resend HTTP boundary exist. Provider credentials and live inbox tests are deferred.                                                                                                  |
| Future WhatsApp adapter                   | Partial/fail-closed                                 | Consent, template payload, durable retries, and provider-ID storage exist. Meta credentials/template approval and status webhook are deferred.                                                                                          |

## Completed modules

- Production React entry point and role-aware routing.
- Fastify startup, configuration validation, health checks, OpenAPI, and error contract.
- PostgreSQL migration runner and all current identity/catalogue/commerce/billing migrations.
- Customer identity and account management.
- Catalogue, five-view product media, admin CRUD, CSV import/export, inventory, serials, and labels.
- Server-priced shipping, vouchers, cart quote, checkout reservation, and idempotent payment
  reconciliation.
- Customer order history, invoices, cancel/return requests, staff fulfilment, and delivery.
- Loyalty, wallet, refunds, online/offline invoices, seller billing, notification outboxes, and
  Tally job server/UI foundations.
- Disposable local startup with seeded products, orders, accounts, shipping, voucher, and billing
  settings.

## Customer frontend stage completed

- Preserved the original demo's home, navigation, colour, typography, catalogue-card, product,
  cart, checkout and account layouts; no redesign or stack change was introduced.
- Confirmed home search, brand/series/scale/budget/rare/offer collection navigation, backend
  featured collections and responsive menus.
- Confirmed all catalogue filters from the demo plus manufacture year, availability, URL-backed
  sorting and incremental pagination against the database API.
- Added explicit database-backed product variations. Each option is a separate sellable SKU and
  shows its current server price and stock on the product page.
- Added cart voucher preview and configured shipping estimates. Voucher eligibility and final
  totals remain server-authoritative and are recalculated at checkout.
- Added a safe non-production payment mode and complete customer confirmation journey. The server
  creates, prices, reserves and confirms the order transaction; the browser never fabricates a
  success response. Production startup rejects test payment mode.
- Expanded browser coverage for successful signup submission, signed-in cart reload persistence,
  cart voucher preview, product variation switching, test checkout and order confirmation.

## Backend, database and admin inventory stage completed

- Added a forward checksum migration for normalized role, brand, series and variation references,
  durable customer carts, captured payment records, order/invoice unit-serial snapshots, review
  flags, constraints and audit search indexes. Existing product text remains an immutable display
  snapshot, so the storefront contract was preserved.
- Added customer-owned cart APIs. They persist only product IDs and quantities; every response and
  checkout obtains current price, publication and stock state from the catalogue.
- Completed CSV create/update staging with duplicate-in-file detection, repeat-safe jobs, row-level
  errors, variation columns, import summaries and stock/serial reconciliation inside one database
  transaction. Blank product names receive an internal `IMPORT-ROW-*` identifier, are visibly
  marked for review and cannot be published until an admin supplies the real name.
- Added captured payment persistence and immutable physical-unit serial snapshots. Online payment
  confirmation records the selected units on order lines; online/offline invoices copy the exact
  serials into their immutable invoice snapshots.
- Added a permission-gated, searchable audit-log API and responsive control-room page. Product
  edits and stock adjustments now include structured before/change metadata.
- Confirmed existing product CRUD/archive, five-image media, variation editing, inventory search,
  row-locked/idempotent stock operations, unit serial generation, barcode lookup/labels, orders,
  shipping, vouchers, loyalty, refunds, customers, sellers and role restrictions remain working.

## End-to-end commerce stage completed

- Added named PIN-prefix shipping zones alongside flat/default rates and optional free-shipping
  thresholds. Quotes and checkout share the same server pricing function, and every order retains
  its applied policy, zone and charge as historical snapshots.
- Added a payment-gateway interface with Razorpay as the credential-gated future adapter and an
  explicitly local test provider. Local payments begin pending and support trusted success,
  failure and cancellation transitions with idempotent retries; production refuses test mode.
- Persisted payment attempts and made trusted confirmation the only path that captures payment,
  awards loyalty and enqueues the email and WhatsApp confirmation outboxes. Provider credentials
  are not stored in business records, and local mode performs no external delivery.
- Completed the fulfilment sequence through processing, shipped, out for delivery and delivered.
  Actor identity and timestamps are retained for each status event, including staff delivery
  updates.
- Added customer refund preferences and transactional admin resolution. Approved store-credit
  refunds are idempotent, append to the wallet ledger, reverse earned loyalty, restore redeemed
  value, release voucher use where applicable and safely restock cancelled orders.
- Added one persistent commerce lifecycle integration covering authenticated catalogue/cart,
  named-zone quote, voucher, checkout, local payment confirmation, invoice, loyalty, order history,
  notification outboxes and delivery. Existing identity tests separately verify signup and login.
- Added failure coverage for repeated payments, failed/cancelled payments, insufficient stock,
  concurrent voucher redemption, duplicate refunds and loyalty/refund reversals.

## Seller billing and offline sales stage completed

- Added a role-protected billing catalogue endpoint that exposes only the fields needed at the
  counter. Product barcodes use the unique SKU value, so a browser-connected scanner can select
  the exact product and retrieve its current server price and stock without admin inventory access.
- Restricted sellers to offline invoices they created. Sellers cannot list or download another
  issuer's invoice, issue an online-order invoice, adjust stock, add discounts/free-text items,
  configure tax or prices, record corrections, manage vouchers/refunds/roles, or access Tally.
- Kept offline issuance transactional: catalogue rows are locked, availability and serial units
  are validated, current database prices and active tax rules are applied, inventory movements are
  written, the immutable invoice is issued and one Tally job is queued before commit.
- Confirmed repeated submissions return the original invoice without reducing stock twice. Cash,
  UPI, card and bank-transfer methods remain invoice snapshots and never become online gateway
  payment records.
- Added authenticated printable invoice downloads alongside the existing responsive A4 print/save
  view. Customer/business details, products, quantities, HSN, discounts, shipping, tax, payment,
  totals and sold-unit serials remain immutable snapshots.
- Added manager-only append-only invoice correction, credit-note record and void-notice history.
  Corrections are idempotent and audited; they never overwrite the issued invoice.
- Added a versioned `tiny-kars-tally-v1` connector payload for sale, customer, invoice, items, tax
  and payment data. Each invoice has one export job/reference, successful Tally references are
  unique, and the connector stays disabled without its secret.
- Verified the browser seller journey on desktop and phone: seller session, exact barcode scan,
  current price/stock, UPI counter sale, invoice, download and responsive layout. Integration tests
  verify the inventory movement, admin offline KPIs, correction immutability and seller denials.

## Final QA and security review completed

- Added a real ESLint gate with TypeScript and React Hooks rules. It found and fixed stale imports,
  incomplete effect dependencies, dead media state and a barcode-label callback that was named like
  a hook. Lint now passes with zero warnings.
- Added browser-wide failure on console errors and uncaught page exceptions. This exposed and fixed
  protected catalogue-overview calls made by signed-out pages and an invalid checkout phone pattern
  under Chromium's current Unicode regular-expression rules.
- Expanded the clean-database catalogue regression across every supported demo filter, sorting and
  pagination.
- Added `verify:persistence`, which migrates an on-disk database, writes inventory and wallet-ledger
  records, fully closes/reopens the API/database and verifies the records plus all 20 migration
  checksums survived.
- Explicitly started and probed the local frontend/API/database: frontend, live, ready and config
  endpoints returned 200; configuration identified local payments as test mode.
- Generated and visually reviewed fresh desktop/mobile seller billing and invoice screenshots.
  The complete release evidence and endpoint/model inventory are in `docs/final-qa-report.md`.

## Persistent local client demo completed

- Added `npm run demo:client`, which reuses `.local/client-demo-db`, applies migrations on every
  start and seeds accounts/catalogue only when the database is new.
- Verified a persistent customer test checkout with voucher, shipping, wallet debit, loyalty
  redemption/award and order history. Added an owner-authorized customer invoice download endpoint
  and integration coverage.
- Verified seller barcode lookup, offline UPI invoice `TK-2026-000001`, shared-stock deduction and
  persistence across a complete application/database restart.
- Verified a persistent store-credit cancellation/refund and inventory restock. Added unused local
  `DEMO10` so the client can repeat the voucher walkthrough after QA consumed `TINY10`.
- Recorded startup, role walkthroughs, sample barcodes, test payments, limitations and remaining
  approvals in `CLIENT_DEMO_GUIDE.md`.

## Foundation changes in this pass

- Declared the documented Node.js 22.14+ and npm 10+ runtime requirements in `package.json` and
  the lockfile so unsupported runtimes fail visibly instead of producing ambiguous build errors.
- Completed the environment template with explicit `NODE_ENV` and frontend `VITE_API_BASE_URL`
  settings while retaining fail-closed provider groups.
- Formatted the three documentation files that failed the repository's formatting check.
- Added this progress record from actual repository inspection and freshly run checks; stale test
  counts in older historical documents are not used as current evidence.

## Remaining modules and launch work

1. Confirm authoritative variation group/label values and real product names in the client
   catalogue before loading and publishing it; the runtime, CSV and admin models are complete.
2. Extend structured before/after metadata to every sensitive settings/finance mutation; the
   searchable audit surface and key product/inventory snapshots are complete.
3. Finalise GST, HSN, place-of-supply, cancellation, legally effective credit-note, and invoice
   numbering rules with the accountant before changing financial documents or posting correction
   records to Tally.
4. Finalise Tally mappings and build/test the client-owned Windows connector/export against the
   actual TallyPrime company.
5. Validate Razorpay sandbox webhooks/refunds, Resend inbox delivery, Meta template delivery, R2,
   managed PostgreSQL, backups/restore, and cloud routing only after client-owned credentials and
   infrastructure are available.
6. Load authoritative product CSV and five-view photographs, then perform printer/scanner and
   client UAT.

## Known bugs and risks

- No active production route, import, build, database, or authentication defect was reproduced in
  this local pass.
- Several older documents contain historical test counts and superseded architecture statements
  (for example, references to an explicit demo build or MFA). Treat this file and fresh command
  output as current until those documents receive a dedicated documentation cleanup.
- `playwright.config.ts` and `tests/e2e` target the legacy prototype. The active `test:e2e` script
  deliberately points to `playwright.production.config.ts`; the legacy suite is not current
  production evidence.
- The host shell used for this audit had no Node.js runtime on `PATH`. Verification therefore used
  an official Node.js 22.14.0 archive extracted under `/tmp`; developers still need Node 22.14+
  installed for normal startup.
- Local integration uses PGlite, not a native PostgreSQL 16 daemon. CI defines a PostgreSQL 16
  service, but that external CI run was not observed during this pass.
- Reverse-proxy IP handling and rate-limit identity must be revalidated against the chosen cloud
  topology before launch.

## Test results

Fresh local results from 22 November 2026:

| Check                                                      | Result                  | Notes                                                                                                                                                      |
| ---------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency resolution (`npm ls --depth=0`)                 | Passed                  | Existing install resolves all declared direct dependencies.                                                                                                |
| Lint (`npm run lint`)                                      | Passed                  | ESLint TypeScript and React Hooks rules pass with zero warnings.                                                                                           |
| Frontend TypeScript (`npm run check`)                      | Passed                  | Strict TypeScript check.                                                                                                                                   |
| Server TypeScript (`npm run check:server`)                 | Passed                  | Strict server TypeScript check.                                                                                                                            |
| Unit/default Vitest (`npm test`)                           | Passed: 30; skipped: 36 | Database suites skip without `TEST_DATABASE_URL`, by design. Includes production rejection of payment test mode.                                           |
| Isolated DB integration (`npm run test:integration:local`) | Passed: 66/66           | Includes seller barcode billing, duplicate submission, invoice scoping/download/corrections, Tally payload, commerce lifecycle, RBAC, inventory and audit. |
| Restart persistence (`npm run verify:persistence`)         | Passed                  | Full close/reopen retained stock, inventory movement, wallet ledger and all 20 migrations.                                                                 |
| Production build (`npm run build`)                         | Passed                  | 2,251 modules transformed; production app only.                                                                                                            |
| Production browser suite (`npm run test:production-ui`)    | Pass: 42; skipped: 6    | Desktop/mobile customer, account, admin, staff and seller journeys passed; skips are deliberate project variants.                                          |
| Production dependency audit (`npm audit --omit=dev`)       | Passed                  | Zero known production dependency vulnerabilities reported by the registry at run time.                                                                     |
| Formatting (`npm run format:check`)                        | Passed                  | Initial run found three documentation files; after formatting, all matched files pass.                                                                     |
| Live providers/cloud/native PostgreSQL                     | Not run                 | Explicitly deferred and no client credentials/infrastructure were supplied.                                                                                |

## Next implementation stage

Stop after the final QA/security review. The next stage requires accountant confirmation of tax,
Tally mapping and legally effective credit-note rules plus client-owned provider credentials,
managed PostgreSQL and acceptance environments. Do not activate live payments, email, WhatsApp,
Tally, or deployment without them. Use `docs/final-qa-report.md` as the release handoff.
