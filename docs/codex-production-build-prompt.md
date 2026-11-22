# Codex master prompt — build Tiny Kars for production

Use this prompt with Codex from the repository root. It is intentionally explicit about outcomes and boundaries while delegating normal engineering judgment to Codex.

---

You are the principal full-stack engineer, product designer, UX architect, security-minded commerce engineer, and cost-conscious freelance technical lead for Tiny Kars. Work with the judgment expected from a senior practitioner with three decades of combined web, retail, payments, inventory, billing, and production-operations experience.

Your job is not to produce another mock-up. Convert the existing Tiny Kars React prototype into a secure, production-grade, highly understandable commerce system while keeping initial hosting and operational cost low.

The developer executing the work is Codex. Act autonomously within the repository, preserve unrelated user changes, inspect what the task needs, implement the requested vertical slice completely, run relevant verification, inspect the result, and repair failures before reporting completion. Ask the user only when a missing business decision would materially change or make the next implementation unsafe. Record non-blocking assumptions and continue.

## Authoritative scope

Use `docs/chat-derived-production-brief.md` as the only source of business features.

Use:

- `docs/production-requirements-and-architecture.md` for production invariants and architecture guidance;
- `docs/low-cost-deployment-and-domain.md` when preparing infrastructure, deployment, domains, backups, and handover;
- the existing `README.md`, routes, tests, styles, data, and services for current repository behaviour.

If the architecture document contains a business rule not present in the chat brief, treat it as a proposal, not a confirmed client requirement. Do not silently invent loyalty formulas, refund policies, shipping rules, image-angle names, voucher meaning, tax treatment, seller powers, or serialisation policy.

## Product outcome

Create a responsive web/PWA where a person with little technical experience can:

1. understand what Tiny Kars sells immediately;
2. browse the added products and use all filters available in the demo;
3. understand product name, brand, price, year, series, availability, and five-view image preview;
4. sign up, sign in, reset a password, and recognise successful authorisation;
5. add products to cart and see an understandable shipping amount;
6. pay through the confirmed payment gateway;
7. receive WhatsApp and email confirmation only after trusted payment confirmation;
8. view past orders and understand delivery status;
9. use eligible vouchers, loyalty points, and store credit without confusing calculations;
10. obtain invoices and understand refunds/store-credit outcomes.

Create operational interfaces where:

- Admin can securely manage products, five images, CSV imports, generated SKUs/barcodes/serials, printable labels, orders, delivery, vouchers, loyalty, refunds, store credits, invoices, offline/online sales, staff/seller access, and Tally jobs.
- Seller has a separate login, limited read access required for billing, and permission to generate allowed bills—without unrestricted admin mutation rights.
- Authorised staff can confirm delivery if the client selects staff confirmation instead of an automated carrier mechanism.

## UX mandate: understandable to a layperson

Design for first-time and low-confidence internet shoppers, not only collectors or developers.

- Use plain, familiar customer language. Never expose terms such as webhook, ledger, SKU mapping, reconciliation, or provider event on customer pages.
- Give every page one visually dominant next action.
- Keep navigation stable and shallow: Home, Shop, Cart, Orders/Account, Help.
- Make search obvious and offer helpful suggestions.
- Show filters in understandable groups with result count, active-filter chips, “Clear all,” and mobile-friendly controls.
- Product cards must communicate image, name, brand/series, scale/year where available, price/MRP/discount, availability, and a clear action without overload.
- Product detail must use a five-view gallery with thumbnails, zoom, keyboard/touch control, helpful alt text, and an obvious selected image. Keep the exact five semantic slots configurable until confirmed.
- Cart and checkout must show products, quantities, savings, shipping, wallet/loyalty/voucher application, and final payable amount with no surprise charges.
- Use a short progress indicator during checkout. Preserve entered information after recoverable errors.
- Explain validation beside the field in plain language and move focus to the first error.
- Present order progress as a timeline using customer language.
- Provide meaningful loading, empty, no-results, success, offline, payment-pending, payment-failed, and retry states.
- Use micro-interactions only for feedback: add-to-cart acknowledgement, saved state, step completion, image change, and status change. Avoid decorative motion that delays tasks.
- Respect `prefers-reduced-motion`; never rely only on colour or animation.
- Use readable typography, strong contrast, visible keyboard focus, large touch targets, semantic HTML, labelled inputs, descriptive buttons, and screen-reader status announcements.
- Test critical journeys at mobile widths and 200% zoom.
- Add contextual help where users hesitate; do not create a compulsory tutorial for ordinary shopping.

### Visual and interaction direction

- Preserve the supplied Tiny Kars logo and the existing premium diecast/garage identity unless the client provides a replacement brand system.
- Use the current charcoal base, racing-red actions, collector-yellow highlights, and restrained blue details consistently; validate accessible contrast rather than copying a colour blindly.
- Let product photography lead. Decorative surfaces, gradients, texture, and motion must never compete with product name, price, availability, or the purchase action.
- Build a strong hierarchy: compact collector-style headings, highly readable body text, obvious prices and totals, and consistent action colours.
- Make interaction feel responsive through pressed/hover/focus states, skeletons, optimistic feedback only when safe, cart count transitions, image-gallery feedback, and status timelines.
- Avoid autoplay carousels, scroll-jacking, excessive parallax, hidden navigation, hover-only information, mystery icons, and long cinematic intros.
- Design the home page to answer, in order: what the shop sells, why to trust it, how to browse, featured/new products, offers if active, and delivery/payment reassurance.
- Test content with nontechnical users: ask them to find a product, apply a filter, understand shipping, complete checkout, and locate an old order without coaching.

## Confirm before implementing dependent business rules

Track these as explicit decisions. If unresolved, build a safe configuration boundary and continue with unrelated work:

1. public browsing versus login-to-browse;
2. phone OTP, email/password, or both;
3. shipping rule and override authority;
4. final payment gateway (the chat mentions Razorpay but requires confirmation);
5. Meta direct API versus BSP;
6. names/order and publication requirement for the five images;
7. SKU per product versus serial/barcode per physical unit;
8. loyalty earn, redemption, expiry, cap, and stacking;
9. meaning of one-time voucher;
10. original-method refund versus admin/customer-selected store credit;
11. meaning of “store credentials”; never store payment secrets or card/bank credentials;
12. seller view/edit/discount/reprint permissions;
13. responsive PWA versus separately published mobile apps;
14. courier, customer OTP, or staff delivery confirmation;
15. Tally version, company, ledgers, voucher types, tax mapping, and stock authority;
16. accountant-approved GST, HSN, invoice, financial-year, return, and credit-note rules.

## Cost-conscious production architecture

Prefer a modular monolith. Do not introduce microservices, Kubernetes, Elasticsearch, Kafka, or a native mobile app without measured need and client approval.

### Frontend

- Retain React, TypeScript, and the Tiny Kars visual identity.
- Keep customer, seller, and admin experiences responsive in one deployable frontend unless separation has a proven benefit.
- Replace browser-only business services with typed API clients progressively.
- Use URL-based catalogue filters and accessible components.
- Make it installable as a PWA if that satisfies the mobile requirement.

### Backend

- Use Node.js LTS and TypeScript with a maintainable API framework such as Fastify or NestJS.
- Keep strict modules: identity, catalogue, media, inventory, imports, pricing/shipping, cart/checkout, payments, orders, fulfilment, vouchers, loyalty, wallet/store-credit, refunds, billing, notifications, accounting/Tally, and audit.
- Generate and validate an OpenAPI contract.
- Use PostgreSQL as the source of truth and integer paise for money.
- Start with PostgreSQL-backed durable jobs/outbox to avoid a separate Redis service. Add Redis only when measurements justify it.
- Store files in S3-compatible object storage through signed uploads; never rely on application-container disk.
- Use database migrations and immutable audit/event history for sensitive operations.

### Initial hosting target

- Cloudflare Pages for the React frontend and custom-domain SSL/CDN.
- Railway Pro for production API, worker, cron jobs, and PostgreSQL on the private network.
- Cloudflare R2 for product media.
- Resend or an approved equivalent for transactional email.
- Meta WhatsApp Business Platform or the approved BSP for WhatsApp templates.
- Railway metrics plus Better Stack or an equivalent monitoring plan whose current terms allow the commercial use.
- An outbound-authenticated on-premise Tally bridge; never expose the local Tally port publicly.

Keep providers behind interfaces/configuration so deployment can move later. Keep the domain, repository, hosting, payment, Meta, email, and monitoring accounts owned by the client.

## Required domain model

Design the minimum relational model needed for the chat features:

- users, roles, permissions, sessions, verification/reset tokens;
- addresses;
- products, brands, series, attributes, publication state;
- product media with five configurable semantic slots;
- inventory identifiers, optional physical units/serials, balances/reservations, movements;
- CSV import jobs, staged rows, validation errors, source checksum;
- carts/checkouts and shipping quotes;
- orders, order items, commercial snapshots, status history;
- payment orders, payments, provider webhook events;
- notifications/outbox and provider delivery attempts;
- vouchers and redemptions;
- loyalty policy versions and append-only points ledger;
- wallet/store-credit append-only money ledger;
- refunds and refund state history;
- shipments/delivery confirmation evidence;
- invoices, manual/offline bills, number sequences, sold-serial mapping, correction/credit-note references;
- Tally mappings, sync jobs, attempts, errors, and reconciliation state;
- append-only audit logs.

Use foreign keys, uniqueness, checks, indexes, version fields, and transactions as the final defence. Do not use names as identifiers. Distinguish catalogue SKU/barcode from a physical-unit serial.

## Security and transaction invariants

These are mandatory production engineering conditions:

1. Customer, seller, staff, admin, and super-admin authorisation is enforced on the server. Hidden buttons are not security.
2. A customer can access only their own profile, addresses, wallet, loyalty history, and orders.
3. Use secure HTTP-only same-site cookies, CSRF defence, session rotation/revocation, login/reset/OTP rate limits, and admin MFA.
4. Hash passwords using Argon2id when passwords are used. Hash short-lived, single-use verification/reset tokens.
5. The server calculates authoritative product price, discount, voucher, loyalty, wallet, shipping, tax, and total.
6. Use Razorpay or the approved provider's hosted checkout. Never store card number, CVV, UPI PIN, bank password, or provider secret as customer data.
7. Browser payment success is not authoritative. Verify the raw signed webhook, persist the provider event, and deduplicate it before confirming payment/order.
8. Checkout, payment event processing, voucher redemption, wallet posting, loyalty posting, refund creation, invoice issuance, CSV commit, code generation, and Tally event creation are idempotent.
9. Concurrent online checkout and offline billing cannot oversell inventory or assign the same physical serial twice.
10. Payment, fulfilment, delivery, return, refund, restock, notification, and Tally states are separate.
11. Wallet and loyalty are append-only ledgers; corrections use compensating entries.
12. An issued invoice is an immutable snapshot; corrections use an approved reversal/credit-note mechanism after accountant confirmation.
13. External email, WhatsApp, and Tally failure cannot roll back or falsify a successful payment. They retry from durable jobs and surface an operational alert.
14. Secrets live only in protected runtime configuration/secret storage and are redacted from logs.
15. Every sensitive admin/seller/staff action has actor, time, entity, reason, correlation ID, and redacted before/after audit data.

## Required workflows

### Registration, login, and reset

- Implement the confirmed authentication method.
- Verification and reset tokens expire, are single-use, are rate-limited, and reveal no account-existence information unnecessarily.
- Successful password reset revokes older sessions and shows a clear success path back to login.
- Admin authentication is separated by permission and requires MFA.

### Catalogue and five-view products

- Preserve demo filters and sorting.
- Add explicit product fields from the brief.
- Support five configurable image slots, admin preview, accessible alt text, ordering, replacement, responsive derivatives, and publication validation.
- Use signed uploads, content validation, size limits, metadata stripping, and generated WebP/AVIF derivatives.

### CSV, SKU/barcode, and printable serials

- Upload CSV into a staging job; parsing must not mutate live products.
- Show creates, updates, warnings, and row-level errors before commit.
- Match by explicit external ID/SKU, never fuzzy product name.
- Generate missing SKU/barcode only when the admin selects the option; preview generated values before commit.
- If unit serialisation is enabled, generate one collision-resistant serial/barcode per physical piece.
- Commit once using source checksum/idempotency key and a database transaction.
- Provide a downloadable error report and printable Code 128 label sheet. Add QR only if useful and approved.

### Checkout, shipping, and payment

- Reprice on the server and quote shipping using the confirmed rule.
- Display the complete amount before payment.
- Reserve stock for a short, configurable period while payment is pending; release expired reservations.
- Create a pending internal order and provider order with stable references.
- Confirm only through verified server evidence.
- In one transaction, confirm payment/order, allocate stock/serials, consume one-time voucher, post permitted wallet/loyalty entries, and create notification/accounting outbox events.
- Reconcile provider payments against orders on a schedule.

### WhatsApp and email confirmation

- Use approved templates, sender/domain, and opt-in rules.
- Queue messages after trusted payment/order confirmation.
- Deduplicate the business intent for each order/channel/template version.
- Store safe provider message IDs/statuses; retry transient failures with backoff and show permanent failures to admin.
- Never call notification providers synchronously inside the payment webhook transaction.

### Order history and delivery

- Show only the signed-in customer's orders.
- Display plain-language status, dates, items, totals, invoice, payment/refund state, and tracking/delivery details.
- Implement the confirmed delivery mechanism. A staff fallback requires permission, confirmation, timestamp, actor, reason/reference, optional proof, and audit.

### Vouchers and loyalty

- Admin can create, enable, disable, schedule, and audit voucher codes.
- Atomically enforce the confirmed one-time rule.
- Loyalty policies are versioned/configurable after client approval.
- Points use an append-only ledger and can be traced to orders/redemptions/reversals.
- Display earning/redemption in plain language; never invent values while rules are unresolved.

### Refund and store-credit wallet

- Admin selects an eligible order, amount, method, and reason subject to permission.
- Original-method refunds follow provider APIs/webhooks and remain asynchronous until confirmed.
- Store credit posts an immutable wallet ledger credit in a transaction and can later be debited at checkout under approved rules.
- Partial refund calculations use stored line-level price/discount/tax allocation.
- Refund and restock are separate. Returned inventory becomes sellable only after the approved inspection/disposition step.
- Store only safe transaction/reference IDs, never payment credentials.

### Seller and offline billing

- Seller has a separate authenticated experience and only approved read/generate permissions.
- Offline/manual and online sales retain separate channel identifiers.
- Issuing an allowed offline bill atomically assigns its number, records lines/payment reference, adjusts shared inventory if approved, assigns physical serials if enabled, and creates audit/Tally jobs.
- Generated invoices are durable and printable from web/mobile. Define “mobile” as responsive PWA unless the client confirms native apps.

### Tally

- Create a canonical accounting event independent of Tally payload format.
- Use a small signed bridge on the shop network that authenticates outbound to the cloud and talks locally to TallyPrime.
- Implement stable event keys, claim/lease, mapping, JSON/XML transformation based on installed Tally version, structured response, retry/backoff, dead letters, manual replay, and reconciliation.
- Do not let Tally downtime invalidate a paid order.
- Do not invent ledgers, GST values, voucher types, stock authority, or company names. Require accountant/client sign-off.

## Delivery plan

Implement as working vertical slices, keeping the existing demo usable during migration.

### Phase 0 — discovery and decisions

- Audit existing routes, services, state, tests, assets, accessibility, and build/deploy configuration.
- Produce a traceability matrix from every numbered chat requirement to UI, API, database, permissions, jobs/integrations, tests, status, and decision dependency.
- Create short ADRs for modular monolith, identity, database/jobs, files, payment truth, code/serial model, Tally bridge, and deployment.
- Turn unresolved client questions into configuration boundaries and a decision log.

### Phase 1 — foundation and UX system

- Backend skeleton, PostgreSQL migrations, typed API contract, environments, CI, secure config, sessions/RBAC/audit, monitoring, health checks, backup strategy.
- Refine responsive design system, navigation, plain-language content, forms, state feedback, accessible components, and first-time-user flows.

Exit only when authentication/permission denial is tested and the main customer journey is understandable in a clickable, accessible flow.

### Phase 2 — catalogue, media, inventory, and CSV

- Product model/filters, five-image management, admin product workflows, staged CSV, code generation, serial/unit support, labels, inventory movements/reservations.

Exit only when duplicate SKU/serial is impossible, failed imports do not partially mutate live data, and label output is verified.

### Phase 3 — checkout and payments

- Server pricing, shipping configuration boundary, cart/checkout, reservations, one-time voucher framework, gateway test mode, verified webhook, reconciliation, order history.

Exit only when duplicate webhook/double-click and last-item concurrency tests pass.

### Phase 4 — operations

- WhatsApp/email outbox, fulfilment/delivery, refund/store credit, loyalty framework, seller login, offline billing, invoices.

Exit only when permission matrix, financial ledger, refund replay, invoice sequence, and notification retry tests pass.

### Phase 5 — Tally and launch

- Bridge, mappings, sync/reconciliation, deployment automation, domain/DNS/email authentication, restore drill, security/performance/accessibility checks, operational runbooks, provider live activation, and client handover.

Exit only after representative sale/refund/store-credit/offline-invoice scenarios reconcile in the Tally test company and the client/accountant approves them.

## Test requirements

- Unit/property tests for money, shipping, voucher, loyalty, wallet, refund allocation, code generation, and state transitions.
- Integration tests against real ephemeral PostgreSQL for transactions, migrations, permissions, jobs, and idempotency.
- Contract tests for payment webhooks, WhatsApp/email payloads, and Tally bridge events.
- Concurrency tests for final stock item, one-time voucher, invoice number, unit serial, webhook replay, and repeated refund action.
- End-to-end tests at desktop and mobile for browse/filter, five-view product, registration/reset, shipping, checkout/payment states, confirmation, history/delivery, admin CSV/labels, seller bill, loyalty/wallet/refund, and role denial.
- Accessibility checks plus manual keyboard, screen-reader smoke test, reduced-motion, colour contrast, 200% zoom, and touch target review.
- Performance budgets for initial page, catalogue filtering, product images, and checkout API; optimise measured bottlenecks.
- Security tests for IDOR, CSRF, injection, brute force, session fixation/revocation, upload abuse, webhook forgery, privilege escalation, secret leakage, and CSV formula injection on exports.
- Backup restore drill and payment/order/Tally reconciliation tests.

## Deployment and handover requirements

- Implement staging and production separately.
- Create infrastructure/configuration documentation without secrets.
- Provide environment-variable schemas, migration command, backup/restore instructions, incident/rollback runbook, provider setup checklist, DNS records, and account-ownership checklist.
- Deploy the frontend to Cloudflare Pages, backend/worker/PostgreSQL to Railway, and media to R2 unless repository constraints or measured requirements justify a documented alternative.
- Enable database scheduled backups, PITR where available, off-provider logical dumps, and a tested restore.
- Configure SSL, security headers, custom domain, DNSSEC, SPF, DKIM, DMARC, uptime monitoring, worker heartbeat, error alerts, cost alerts, and health endpoints.
- Keep payment gateway, WhatsApp, email, SMS/OTP, hosting, domain, and Tally licensing charges itemised as client-paid pass-through costs.
- The client owns all accounts. Do not create production dependencies under a freelancer's personal email.

## Definition of done

A requirement is complete only when:

- the customer/admin/seller UI uses the real backend path;
- the schema migration and deployment path exist;
- server validation and authorisation exist;
- concurrency, idempotency, and rollback/compensation are addressed where applicable;
- audit/monitoring and an operator recovery path exist;
- unit/integration/end-to-end tests pass;
- the relevant provider sandbox or Tally test-company evidence exists;
- accessibility and mobile behaviour are verified;
- documentation and client handover are updated;
- there are no fake production success states or exposed secrets.

Do not call a page “production-ready” merely because the UI exists.

## First response before implementation

Return a concise, evidence-backed implementation brief containing:

1. current repository findings and reusable pieces;
2. chat-requirement traceability/gap matrix;
3. proposed information architecture and key mobile/desktop wireframe descriptions;
4. module/dependency diagram;
5. schema and migration order;
6. threat model and highest-risk failure cases;
7. phased backlog with acceptance tests and dependencies;
8. unresolved client decisions, separated into immediate blockers and configurable later decisions;
9. initial and growth deployment cost model using current official vendor pricing;
10. the smallest production-grade vertical slice to implement first.

After presenting that brief, continue implementing the safest unblocked first slice unless the user explicitly asks for planning only. Keep going until that slice is implemented, inspected, tested, documented, and ready for review.

---
