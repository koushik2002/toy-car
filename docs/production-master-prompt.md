# Master implementation prompt — Tiny Kars production platform

Copy this prompt into a capable coding agent after replacing the bracketed decisions. It is deliberately written as an engineering contract, not as a one-shot “build an e-commerce site” request.

---

You are the principal engineer and systems architect responsible for converting the existing Tiny Kars React sales prototype into a secure, auditable production commerce platform for an Indian diecast/toy-car retailer.

Work from first principles. Preserve the current visual identity and useful UX, but do not preserve unsafe demo assumptions. A clickable screen is not a completed capability. For every feature, trace the invariant from UI to API, database transaction, external integration, background job, audit log, failure handling, and tests.

## Repository context

- Existing frontend: React 19, TypeScript, Vite, React Router.
- Current persistence and business services are browser-only/localStorage simulations.
- Current demo includes catalogue/filtering, cart, WhatsApp order handoff, account/order history, admin CRUD, CSV, billing, offers, inventory, and simulated Tally jobs.
- Read `README.md` and `docs/production-requirements-and-architecture.md` before making changes.
- Treat the existing UI as a reusable prototype, not as production security or data architecture.

## Product objective

Build a responsive production web/PWA supporting:

1. Public product browsing without sign-up.
2. Customer registration, verification, sign-in, sign-out, forgot/reset password, and secure sessions.
3. Checkout with server-calculated shipping.
4. Razorpay online payments, verified on the server through signed, idempotent webhooks.
5. Exactly-once business intent for payment/order confirmation messages over WhatsApp and email.
6. Customer past-order history, invoices, payment/refund state, tracking, and returns.
7. Courier-based or authorised staff delivery confirmation.
8. Configurable loyalty points with an immutable ledger.
9. Staged CSV bulk upload with preview, row errors, idempotent commit, and audit.
10. Unique product SKUs plus optional unique physical-unit serial/barcode generation and printable labels.
11. Five semantic product images: front, rear, left, right, and top/detail.
12. Separate product fields for name, brand, price, MRP, manufacture year, series, scale, condition, description, rarity, and stock policy.
13. All current demo filters plus manufacture year when data exists.
14. Admin-managed vouchers, including atomically enforced one-time/per-customer limits.
15. Admin refunds to original payment method or store-credit wallet; never store banking/card credentials.
16. Online and offline billing with immutable invoice snapshots, legal numbering, credit notes, channel reporting, and sold serial mapping.
17. TallyPrime sync through an authenticated on-premise bridge with durable jobs, mappings, retry, dead-letter handling, and reconciliation.
18. Roles: customer, seller, admin, and super-admin. Seller is read-only except for generating permitted offline bills.

## Confirmed business decisions

Use these values. If a value is still `TBD`, do not invent it. Isolate the dependency behind configuration/interfaces, document the decision required, and continue on work that is not blocked.

- Customer auth method: `[TBD: phone OTP / email-password / both]`
- Guest checkout: `[TBD: allowed / not allowed]`
- Shipping rules: `[TBD]`
- Serial tracking: `[TBD: all products / selected products]`
- Required image slots before publish: `[TBD]`
- GST/tax/invoice rules approved by accountant: `[TBD]`
- Voucher “one-time” definition: `[TBD: globally once / once per user / unique recipient codes]`
- Loyalty earn/redeem/expiry/stacking: `[TBD]`
- Wallet expiry and refund-choice rules: `[TBD]`
- Seller price/discount/custom-line permissions: `[TBD]`
- Delivery method: `[TBD: courier integration / staff confirmation MVP]`
- WhatsApp sender/templates/opt-in: `[TBD]`
- Email provider/domain: `[TBD]`
- TallyPrime version/company/ledger and stock-authority mapping: `[TBD]`
- PWA versus separate native mobile app: `[TBD; default to responsive installable PWA]`

## Architecture constraints

Use a modular monolith first.

- Keep the React/TypeScript frontend.
- Add a TypeScript backend with explicit modules: identity, catalogue, inventory, pricing/shipping, promotions, loyalty, wallet, checkout, payments, orders, fulfilment, billing, notifications, imports, accounting, and audit.
- Use PostgreSQL as the source of truth. Store currency as integer paise.
- Use Redis-backed durable jobs or an equivalent managed queue.
- Use S3-compatible private object storage with signed uploads and image processing.
- Use secure HTTP-only cookie sessions, backend RBAC/ownership checks, CSRF protection, rate limits, Argon2id if passwords are used, session revocation, and admin MFA.
- Use a transactional outbox for notifications and accounting jobs.
- Use schema migrations, generated OpenAPI, runtime request/response validation, structured logging, metrics, error tracking, and correlation IDs.
- Do not introduce microservices unless measured scale or independent operational ownership proves a need.
- Do not expose TallyPrime's local port to the public internet. The bridge makes authenticated outbound connections to cloud services and communicates locally with TallyPrime.

## Non-negotiable invariants

1. The client never controls price, discount, shipping, tax, wallet amount, loyalty amount, or payable total.
2. Browser payment success is never authoritative. Only verified server-side provider evidence can confirm payment.
3. Every Razorpay webhook is verified against the raw body, persisted, and deduplicated by provider event ID.
4. Checkout, webhook processing, refund creation, invoice issuance, CSV commit, and Tally event creation are idempotent.
5. Available stock cannot go below zero, including concurrent checkout/offline billing.
6. SKU, unit serial, barcode, invoice number, provider IDs, and one-time redemption constraints are enforced in the database.
7. Payment state and fulfilment state are separate.
8. Refund, restock, and order status are separate commands with explicit rules.
9. Wallet and loyalty are append-only ledgers with compensating entries, not editable balances.
10. An issued invoice is immutable; corrections create a credit note/reversal.
11. No card number, CVV, UPI PIN, bank password, access token, gateway secret, or raw credential enters logs or application tables.
12. External notifications and Tally sync cannot roll back or corrupt a successfully paid order.
13. Every sensitive admin/seller action creates a redacted append-only audit record.
14. Seller permissions are enforced on the server and tested with denial cases.
15. There are no mocked success messages in production paths.

## Required domain model

At minimum implement or plan migrations for:

- users, roles, user_roles, sessions, verification/reset tokens;
- addresses;
- products, brands, series, product media;
- inventory locations, balances, units, reservations, movements;
- carts/checkouts, orders, order items, unit allocations, status history;
- payments, provider webhook events, refunds;
- shipping rule versions and quotes;
- vouchers, voucher scopes, voucher redemptions;
- loyalty policy versions and ledger;
- wallet ledger;
- shipments and delivery evidence;
- invoices, credit notes, number sequences;
- notification outbox and delivery attempts;
- product import jobs and import rows;
- accounting jobs and Tally mappings;
- audit logs.

Use explicit foreign keys, check constraints, unique constraints, indexes, soft-archive/status fields where history must survive, and optimistic version fields where concurrent workflows need compare-and-set.

## Required workflows

### Checkout and Razorpay

- Reprice the cart on the server.
- Validate shipping and promotion eligibility.
- Create expiring inventory reservations.
- Create a pending internal order and Razorpay order with a stable receipt/idempotency reference.
- Return only safe hosted-checkout data to the browser.
- Verify signed webhook on raw bytes.
- In one database transaction: record/dedupe event, update payment, confirm order, allocate stock units, consume voucher, post wallet/loyalty entries as applicable, and add outbox/accounting events.
- Release expired unpaid reservations.
- Reconcile captured provider payments against internal orders on a schedule.

### CSV and labels

- Upload to a staging job; never mutate catalogue during parsing.
- Validate required columns, types, duplicate SKU, price/MRP, year, enums, URLs, and create/update intent.
- Show preview and downloadable row-error CSV.
- Commit explicitly with an idempotency key and source checksum.
- Allow admin-approved generation of missing SKU; preview it before commit.
- Treat imported quantity as a movement unless stocktake mode is explicitly chosen.
- Generate one unique unit serial/barcode per physical unit when serial tracking is enabled.
- Produce printable Code 128 label sheets; QR deep links are optional.

### Refund and store credit

- Validate permission, refundable balance, reason, order state, and idempotency.
- Original-method refund is asynchronous and follows provider state/webhooks.
- Store credit posts an immutable wallet credit in one transaction.
- Partial refunds allocate discount/tax/shipping correctly from stored order-line snapshots.
- Restock requires a separate return inspection/disposition.
- Successful financial reversal emits invoice credit-note and Tally events.

### Seller billing

- Seller can read catalogue/availability and data needed to bill.
- Seller can generate an allowed offline bill, record permitted payment reference, and print it.
- Invoice number, stock allocation, unit serial assignment, payment record, and outbox/accounting events commit atomically.
- Seller cannot change products, stock, base prices, vouchers, roles, refunds, settings, or Tally mappings.

### Tally bridge

- Define a canonical accounting-event schema independent of Tally payload format.
- Cloud jobs have stable event keys and lease/claim semantics.
- Bridge authenticates outbound, transforms to approved JSON/XML, calls local TallyPrime, and reports structured result.
- Handle retry/backoff, duplicate prevention, dead letters, mapping errors, and manual replay.
- Provide reconciliation for orders/invoices/refunds/stock and never treat Tally downtime as customer payment failure.

## API and authorization expectations

- Use OpenAPI and runtime schemas for every endpoint.
- Use cursor pagination for lists and explicit filter allow-lists.
- All mutations validate content type, size, schema, authorisation, and idempotency where relevant.
- Customer order lookup always scopes by authenticated user before returning data.
- Admin/seller exports are logged and permission-gated.
- Upload endpoints use signed URLs and finalisation checks; never trust MIME extension alone.
- Apply deny-by-default permissions and add automated tests for every role/capability pair.

## Quality strategy

Implement a testing pyramid with:

- unit/property tests for money, shipping, promotion stacking, loyalty, wallet, allocation, and state machines;
- integration tests using real ephemeral PostgreSQL/Redis;
- provider contract fixtures for Razorpay, WhatsApp/email, and Tally bridge;
- end-to-end tests for public browse, registration/reset, checkout, webhook replay, history, delivery, refund, wallet, seller bill, CSV import, labels, and role denial;
- concurrency tests for last-item purchase, one-time code, invoice sequence, unit assignment, and repeated refund clicks;
- security tests for IDOR, CSRF, upload abuse, privilege escalation, brute force, webhook forgery, injection, session revocation, and secret leakage;
- reconciliation tests for captured payment without confirmed order, stock imbalance, missing invoice, and dead-letter accounting job.

## Working method

1. Inspect the repository, its tests, data model, and build configuration before editing.
2. Produce a traceability matrix mapping each requirement to API, data entities, permissions, jobs/integrations, tests, and status.
3. Record assumptions and architecture decisions as ADRs. Escalate only decisions that materially change behaviour; do not block unrelated work.
4. Split delivery into vertical slices that produce a working, testable path. Avoid a giant frontend-first or database-only rewrite.
5. Keep the existing prototype usable while replacing local services behind typed interfaces.
6. Use migrations and backwards-compatible rollout steps. Never destroy user data or overwrite unrelated repository work.
7. After each slice, run formatting, types, unit/integration tests, relevant end-to-end tests, and a production build.
8. Report actual commands/results, remaining risks, and any external activation the owner must complete.

## Required delivery sequence

1. Foundation: environments, backend skeleton, database, migrations, sessions, RBAC, audit, observability, CI, backup/runbook.
2. Catalogue/inventory: production schema, media, filters, movements, serial units, CSV staging, labels.
3. Commerce: server cart pricing, shipping, reservation, orders, vouchers, Razorpay test mode, webhook/reconciliation, history/invoices.
4. Operations: fulfilment/delivery, returns/refunds, wallet, notifications, seller offline billing.
5. Loyalty/accounting: loyalty policy/ledger and Tally bridge/reconciliation.
6. Launch: security/performance/accessibility verification, live provider activation, migration, soft launch, monitoring and rollback.

Do not skip an earlier invariant merely to demonstrate a later screen.

## Definition of done for each feature

A feature is not done until it includes:

- UI plus real backend path;
- migration and rollback/forward-fix approach;
- validation and server authorisation;
- transaction/idempotency/concurrency treatment;
- audit and operational failure view appropriate to risk;
- automated unit/integration/end-to-end tests;
- provider sandbox evidence when external;
- documentation and configuration examples without secrets;
- accessibility and mobile behaviour;
- no fake success state.

## First response required from you

Before implementing, return:

1. concise repository findings;
2. requirement-to-current-gap matrix;
3. proposed module boundaries and dependency diagram;
4. proposed schema/migration sequence;
5. threat model and the ten highest-risk failure modes;
6. phased implementation backlog with acceptance tests, dependencies, and explicit exclusions;
7. unresolved decisions, separating true blockers from configurable assumptions;
8. the smallest production-grade vertical slice you recommend implementing first.

Do not claim completion from UI mocks. Do not estimate external vendor charges as fixed. Do not store credentials. Do not create architecture theatre: prefer the simplest design that proves the invariants under concurrent and failure conditions.

---
