# Tiny Kars backend engineering status

Updated: 1 November 2026

## Backend foundations completed in code

| Feature                            | Backend status                  | Evidence                                                                                                                                        |
| ---------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer identity                  | Complete foundation             | Email verification, password reset, sessions, CSRF, role checks and MFA tests pass.                                                             |
| Catalogue and five-view media      | Complete foundation             | Product fields, five slots, R2 adapter, publishing guard, CSV staging and validation exist.                                                     |
| Series codes, serials and barcodes | Complete foundation             | Persistent six-digit brand/series prefix, model/unit codes and printable SVG barcode routes are tested.                                         |
| Shipping                           | Complete foundation             | Versioned flat/PIN rules, activation and server quotes are tested.                                                                              |
| Vouchers                           | Complete foundation             | Global-once/once-per-customer policies, preview, atomic checkout use and expiry release are tested.                                             |
| Checkout and Razorpay payments     | Complete foundation             | Server pricing, inventory reservation, provider order, idempotency, signed webhook reconciliation and mismatch review are tested.               |
| Loyalty points                     | Complete backend foundation     | Super-admin policies, append-only points ledger, adjustments, checkout redemption/reversal, payment earning and full-refund reversal exist.     |
| Store-credit wallet                | Complete backend foundation     | Append-only balance ledger, adjustments, checkout spending/reversal and refund credit exist.                                                    |
| Refunds                            | Complete backend foundation     | Partial/full limits, idempotency, store credit, Razorpay source refund creation, provider refresh/matching and terminal order transition exist. |
| Order history and delivery         | Complete foundation             | Customer ownership, timeline, staff-only delivery confirmation and admin transitions are tested.                                                |
| Email confirmations                | Complete foundation             | Durable outbox, leasing, retries, provider idempotency and failure bounding exist.                                                              |
| WhatsApp confirmations             | Complete backend foundation     | Explicit checkout consent, durable outbox, approved-template payload contract, retry handling and provider-ID storage are tested.               |
| Seller billing access              | Complete backend foundation     | Seller can read/generate invoices but cannot change super-admin billing settings.                                                               |
| Online/offline invoices            | Complete backend foundation     | Immutable sequential numbers, settings snapshots, separate channels, order snapshots and inventory-aware offline sales exist.                   |
| Tally                              | Complete server-side foundation | Durable jobs, admin retry, secret-authenticated connector claim, lease and completion acknowledgement are tested.                               |

## Backend work conditional on client/provider decisions

These items cannot be completed correctly by guessing values:

1. GST/HSN invoice model after accountant approval: inclusive/exclusive pricing, CGST/SGST/IGST split, product HSN, place of supply, credit notes and cancellation rules.
2. Tally mapping after receiving TallyPrime version, company, ledgers, voucher type, stock-item and tax mappings. The server connector exists; the client-side Tally XML/ODBC bridge needs these mappings and a Windows machine owner.
3. Meta delivery/read-status webhook after the Meta app secret, verify token and approved status-event configuration are available. Sending, retries and accepted-message IDs already exist.
4. Automated courier integration if the client chooses a courier. The approved alternative—staff delivery confirmation—is implemented.
5. Scheduled automatic polling of pending Razorpay refunds if desired. An authenticated provider-refresh endpoint already exists; live behavior must determine the interval.
6. Production reporting/exports after the accountant specifies daily, GST, settlement and stock report formats.

## Completed application screens

- Customer loyalty balance, wallet balance and refund history.
- Checkout controls for store credit and loyalty redemption.
- Super-admin loyalty policies, loyalty/wallet adjustments and refund management.
- Seller online/offline invoice generation and printable invoice view.
- Super-admin billing settings plus Tally job visibility and retry controls.

## Work remaining outside code completion

- Provider registration, KYC, credentials, template approval and sandbox/live testing.
- Cloudflare/database deployment, secrets, DNS, backups, alerts and restore drill.
- Real product CSV, five-view photographs, print/scan acceptance and client UAT.

## Latest verification

- 48/48 database integration tests passed.
- 31 non-database unit tests passed; 17 database cases are intentionally skipped when no database URL is supplied.
- 36/36 production Playwright checks passed: 18 desktop and 18 mobile.
- Frontend TypeScript, server TypeScript and production Vite build passed.

External Meta, Tally, Razorpay sandbox/live, email inbox, R2, managed PostgreSQL and Cloudflare tests remain launch gates; local tests do not activate those providers.
