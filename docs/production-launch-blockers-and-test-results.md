# Tiny Kars production launch gates and test evidence

Updated: 1 November 2026

## 6 November 2026 update — demo parity

The production screens were rebuilt on the approved demo's design (`src/styles.css`) and now cover
the demo's features with real data. Added since 1 November:

- Storefront: demo header, mega menus, live search suggestions, home sections, full shop filters,
  multi-product **cart** (drawer and page), wishlist, back-in-stock requests, related products,
  five-view gallery and a checkout with saved addresses and a **live price breakdown before payment**.
- Accounts: order cards with photos, journey timeline with courier/tracking, saved addresses,
  profile, change password, rewards tab, reorder, customer **cancel/return requests** and the
  customer's own invoice.
- Control room: dashboard KPIs and charts, product table with full edit, CSV export/template,
  rupee-based CSV import with stock, inventory movement log, order desk with courier/tracking and
  delivery recipient, customers, offers/shipping, finance, billing desk with address, payment
  method, shipping, HSN, admin-only discount and custom items, honest Tally page, A4 label sheets
  and team roles.
- Server: readable order numbers (`TK-2026-1001`), shipped/delivered emails, `PUBLIC_BROWSING`
  switch (off by default), migration `009_storefront.sql`, and 14 new integration tests.
- Sample catalogue: 60 demo cars with five labelled sample photos each for local/staging review.
- Two-step (authenticator) sign-in was **removed** on 6 November at the project owner's request.
  Staff, admins and the super admin now sign in with email and password only, so strong unique
  passwords for those accounts matter more. Older test records below still mention MFA.

Open client questions are listed in [client-questions-for-launch.md](client-questions-for-launch.md).

## Current release decision

The application's requested code paths are implemented and locally verified, including catalogue,
identity, shipping, vouchers, checkout, loyalty, wallet/refunds, billing, invoices, WhatsApp outbox
and Tally job management. It is not ready to accept public money until provider registration, real
credentials, production infrastructure, client data and live/sandbox acceptance are completed.

Checkout is fail-closed: it becomes visible only when all three Razorpay settings are present.
Missing keys leave the site in a clear payment-registration-pending state.

## Requirement-by-requirement status

| Original requirement                                  | Current status           | Verification or remaining work                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public product visibility                             | Implemented              | Production browser test passes on desktop and mobile.                                                                                                                                |
| Email/password sign-up, verification, login and reset | Implemented              | Database integration and browser registration tests pass. Real sending-domain inbox test remains.                                                                                    |
| Shipping amount after login                           | Implemented              | Super admin can create/activate flat or PIN-prefix policies; customer quote and checkout calculation are server-side.                                                                |
| Razorpay payment gateway                              | Code-complete foundation | Atomic order creation, provider order creation, webhook signature/provider verification, idempotency and mismatch review are tested. Sandbox keys and dashboard webhook test remain. |
| Email after confirmed payment                         | Implemented foundation   | Durable Resend outbox, retry and idempotency tests pass. Real provider inbox test remains.                                                                                           |
| WhatsApp after confirmed payment                      | Backend implemented      | Consent-gated durable outbox, template payload, retries and provider ID storage are tested. Meta sender and approved template remain.                                                |
| Past order history and tracking                       | Implemented              | Customer ownership checks, list/detail timeline and desktop/mobile browser journeys pass.                                                                                            |
| Delivery confirmation                                 | Implemented              | Staff may confirm delivery only; admin can move preparation/shipping states. Database tests cover transition and role rules.                                                         |
| Admin and seller sign-in                              | Implemented              | Admin/staff/seller boundaries are enforced; seller billing screens and invoice generation are browser tested.                                                                        |
| Loyalty points customisation                          | Implemented              | Append-only ledger, super-admin policies, checkout earn/redeem/reversal, customer balance and admin controls are tested.                                                             |
| CSV bulk upload                                       | Implemented              | Staged preview/commit, row errors and idempotent import tests pass. Real Gopal Sagar CSV remains.                                                                                    |
| Five product image views                              | Implemented structure    | Five fixed slots and publish guard exist. Real five-view images, slot names and R2 upload test remain.                                                                               |
| Product name, brand, price, year and series fields    | Implemented              | API, CSV and UI model these separately. Final authoritative data remains.                                                                                                            |
| Demo filters                                          | Implemented              | Search, brand, series, scale, condition, year, price, stock, rarity, offer and sorting are available.                                                                                |
| One-time vouchers                                     | Implemented for checkout | Global-once and once-per-customer policies, preview, atomic checkout use and abandoned-checkout release are tested. Client must select the policy used for each code.                |
| Refunds and store-credit wallet                       | Implemented foundation   | Append-only wallet, idempotent store/source refunds, provider reconciliation and customer/admin screens exist. Live refund drill remains.                                            |
| Web/mobile billing and invoice numbers                | Implemented foundation   | Immutable sequence, snapshots, responsive invoice generation and print view exist. Accountant-approved GST/HSN model remains.                                                        |
| Tally integration                                     | Server/UI implemented    | Durable connector jobs, leases, completion and admin retry screen exist. Tally company/ledger mappings and Windows bridge remain.                                                    |
| Offline sales separated from online                   | Implemented              | Separate invoice channels, seller permissions, offline stock deductions and seller invoice UI are tested.                                                                            |
| Random series-based product and unit codes            | Implemented              | Persistent six-digit brand/series prefix with product and unit suffixes is database tested.                                                                                          |
| Printable barcode/serial labels                       | Implemented foundation   | Admin SVG labels exist. Real printer and scanner acceptance test remains.                                                                                                            |
| Interactive, layperson-friendly UX                    | Implemented foundation   | Plain-language navigation, responsive checkout, visible totals, accessible forms and status timelines are browser tested. First-time client acceptance test remains.                 |

## What blocks Cloudflare registration and deployment

- The client must choose and approve the exact `.com` name. Availability is only final at checkout.
- The Cloudflare account must be owned by the client using a client-controlled email, MFA and
  recovery method.
- The client must enter the card and billing details; these must not be sent to the developer.
- The present API is Fastify with PostgreSQL. Cloudflare Pages can host the frontend, but the API
  cannot run unchanged on Workers and cannot connect through arbitrary raw PostgreSQL TCP.
- Choose one deployment path:
  - fastest and lowest launch risk: Cloudflare Registrar, DNS and Pages for the frontend, with a
    managed Node/PostgreSQL backend elsewhere; or
  - Cloudflare-only: migrate Fastify/PostgreSQL to Workers/D1/R2, then repeat the complete database,
    payment and concurrency test suite.
- Production secrets, database, migrations, backup/restore, monitoring, alerting and log retention
  must be configured before DNS cutover.

## What blocks Razorpay activation

- Client-owned Razorpay account and authorised signatory access.
- Business KYC, PAN, bank proof, business/address evidence, website policies and support contacts.
- Test `key_id`, test `key_secret`, and a separately generated webhook secret entered directly into
  the deployment secret manager.
- Public HTTPS webhook URL configured for `payment.captured`.
- Test-mode successful payment, failed payment, cancellation, duplicate webhook, delayed webhook,
  amount mismatch and abandoned-checkout tests.
- Live account activation followed by a small live payment, settlement/reconciliation check and
  refund drill before public launch.

## Remaining client inputs

- Final `.com` domain name and legal/business owner details.
- Gopal Sagar's final product CSV and five real images for every product.
- Super-admin selections for shipping, voucher, loyalty and refund/store-credit policies.
- Accountant-approved GST, HSN, invoice numbering and sample invoice.
- Refund return window, approval roles and whether refunds default to source or store credit.
- Loyalty earn rate, redemption value, minimum/maximum use, expiry and reversal policy.
- Meta WhatsApp Business account, sender number, opt-in text and approved confirmation template.
- TallyPrime version, company, ledgers, stock items, tax mappings and connector machine owner.
- Support email, phone, address, privacy policy, terms, shipping policy, cancellation/return policy
  and refund policy.

## Test evidence from this implementation pass

| Test layer                                                          |       Result | Feature evidence                                                                                                                                                                                |
| ------------------------------------------------------------------- | -----------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database integration using PostgreSQL-compatible PGlite wire server | 48/48 passed | Identity, MFA, catalogue, codes, shipping, vouchers, checkout, loyalty, wallet/refunds, billing, Tally, WhatsApp, orders, Razorpay and email.                                                   |
| Production Playwright desktop Chrome                                | 18/18 passed | Login-first storefront, session navigation, conditional staff MFA, complete account access, accessibility, catalogue operations, delivery, checkout, finance, billing/invoices and Tally retry. |
| Production Playwright mobile Chromium at 360×800                    | 18/18 passed | The same 18 production journeys at mobile width, including responsive control-room forms and normal tap targets.                                                                                |
| Unit/service tests without database                                 |    31 passed | Existing service and security tests; 17 database cases are skipped when no database URL is supplied.                                                                                            |
| Frontend TypeScript                                                 |       Passed | `tsc -b`.                                                                                                                                                                                       |
| Server TypeScript                                                   |       Passed | `tsc --noEmit -p tsconfig.server.json`.                                                                                                                                                         |
| Production Vite build                                               |       Passed | Deployable frontend assets generated in `dist/`.                                                                                                                                                |

Provider sandbox testing, live domain/DNS, real email delivery, Meta WhatsApp, R2, physical label
printing, managed PostgreSQL, Cloudflare Workers/D1 and Tally were not exercised by these local
tests. Local passing tests must not be presented as provider activation or production certification.

## Recommended launch order

1. Client creates Cloudflare and Razorpay accounts under client ownership.
2. Choose hybrid deployment or approve the Cloudflare Workers/D1 migration.
3. Import and visually approve the real product catalogue and five-view media.
4. Configure staging infrastructure and provider test credentials.
5. Run staging end-to-end, security, backup/restore and provider-failure tests.
6. Obtain client and accountant sign-off.
7. Configure live keys, run a controlled live payment/refund, then cut over DNS.
