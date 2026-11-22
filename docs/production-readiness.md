# Tiny Kars production readiness — 1 November 2026

**Decision:** do not accept live online payments or issue real tax invoices yet. Checkout is now
implemented but remains fail-closed until all Razorpay credentials are configured. Passing local
tests is not merchant activation or a production restore test. See
[`production-launch-blockers-and-test-results.md`](production-launch-blockers-and-test-results.md)
for the current launch gate.

| Requirement area        | Implemented and locally checked                                                                                                                                                                                                                       | Still required before launch                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storefront and accounts | Public catalogue, search and demo filters, five image views, email/password registration, verification/reset, session revocation, responsive and accessible customer screens                                                                          | Approved product feed/photos from Gopal Sagar; verified sending domain and real inbox tests                                                               |
| Team access             | One-time super admin bootstrap; TOTP MFA and recovery; super admin role assignment to verified users; staff/admin MFA gate; seller role boundary                                                                                                      | Operational handover of initial account, recovery procedure, final seller permissions                                                                     |
| Catalogue operations    | Draft/edit/publish/archive, inspected image conversion and R2 upload path, staged CSV preview/commit, unique model SKUs and physical unit serials, barcode labels, inventory movement audit                                                           | Real R2 bucket upload/delete test, approved image-slot labels, real catalogue import and print scan check                                                 |
| Orders and delivery     | Customer-owned order history/detail, timeline, admin preparation/shipping and staff delivery confirmation with role and transition checks; durable paid-order email confirmation outbox                                                               | Actual checkout/order creation, courier or staff proof policy, provider inbox delivery test and remaining order notification events                       |
| Razorpay                | Atomic checkout/order creation, stock reservation and expiry, voucher redemption, provider order creation, signed `payment.captured` webhook, provider fetch, amount/order validation, idempotent settlement, mismatch review record, and retry tests | Sandbox credentials and webhook configuration; payout reconciliation, live payment/refund drill and merchant live activation                              |
| Promotions and credit   | Voucher redemption; append-only loyalty/wallet ledgers; checkout use/reversal; customer balances; super-admin policy, adjustment and refund screens                                                                                                   | Client policy confirmation and sandbox/live financial drills                                                                                              |
| Billing and accounting  | Immutable invoice numbering/settings snapshots, seller-limited online/offline billing, responsive printable invoice UI and Tally job dashboard                                                                                                        | Accountant-approved GST/HSN model, Tally company/version/ledger mapping and real sync test                                                                |
| WhatsApp                | Consent-gated durable template outbox, retry handling and provider reference storage                                                                                                                                                                  | Meta Business sender, approved template, credential and sandbox delivery/status test                                                                      |
| Operations              | Migration checksums, health endpoints, encrypted email outbox, role/CSRF checks, local CI/test workflows                                                                                                                                              | Owned domain, production secrets, deploy, managed database backups and restore drill, monitoring/alerts, real provider tests, native PostgreSQL CI result |

## Confirmed decisions

- Email/password with email verification and password reset.
- Razorpay is the chosen gateway.
- The super admin creates and manages shipping, voucher, loyalty, and refund/store-credit rules in the dashboard; the client confirms the choices. Tax and invoice setup still needs accountant approval.
- Each brand-and-series pair receives one persistent random six-digit prefix. Generated product codes use `<prefix>-P<number>` and physical unit codes use `<prefix>-U<number>`. Different brands using the same series name currently receive separate prefixes; confirm this with the client.
- Razorpay test keys and those approved values are still pending, per the user's latest reply.

## Minimum handoff needed to finish the financial path

The client should confirm which shipping, voucher, loyalty, and refund options the super admin is allowed to configure; the super admin will enter the actual values in the dashboard when those controls are built. The accountant should approve GST/HSN and invoice examples. Provider credentials must be entered into the client's secret manager, not source files or chat. Gopal Sagar's authoritative product CSV, including a series for every product, and five real views per model are needed to populate the catalogue. Meta WhatsApp templates and Tally mappings require their respective business accounts.

## Local verification record

- 48 backend tests passed with a PGlite PostgreSQL-compatible wire adapter, including auth, MFA, catalogue, codes, shipping, vouchers, checkout, loyalty, wallet/refunds, seller billing, Tally connector, WhatsApp, orders and Razorpay/email reconciliation.
- 36 production Playwright checks passed on desktop and mobile, covering the login-first catalogue, live session navigation, conditional staff MFA, complete account recovery, admin CSV/image/publish/stock/serial workflows, order tracking and staff delivery, checkout, shipping/vouchers, loyalty/wallet/refunds, billing settings, online/offline invoices, printing and Tally retry.
- 14 legacy demo Playwright checks passed on desktop and mobile.
- Production build and both TypeScript checks passed. Provider sandbox and production infrastructure tests have not run.
- `npm audit --omit=dev --audit-level=high` reported zero production dependency advisories at the time of this check.

Shipping rule drafts, activation, customer quotes and server-side checkout calculation are
implemented. The client still needs to confirm whether flat, PIN-prefix, and optional free-threshold
charging cover its intended policy. Voucher drafts, previews and atomic checkout redemption are
implemented. Loyalty, refund/store-credit wallet and invoice management screens are implemented;
approved policy values and provider/accountant tests remain open.

Checkout creates the customer order and Razorpay order, reserves stock for 15 minutes and safely
releases abandoned reservations. The webhook reconciles the stored Razorpay order and queues the
email confirmation. A valid payment whose amount or reference differs is stored as
`requires_review` and cannot move the order to paid. Public payment must remain disabled until
provider sandbox and staging tests pass.
