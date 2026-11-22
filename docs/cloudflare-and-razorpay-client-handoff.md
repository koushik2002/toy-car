# Tiny Kars — Cloudflare domain, hosting and Razorpay handoff

**Prepared:** 1 November 2026<br>
**Target launch:** 10 November 2026<br>
**Primary domain requirement:** `.com`

This document tells the client what accounts, business information and provider configuration are required. Secrets, PAN/Aadhaar files, OTPs, bank credentials and card details must be entered by the client directly into the relevant provider. They must not be sent through chat, email, source code or screenshots.

## 1. Domain availability checked

Public registry RDAP checks made on 1 November 2026 returned **no registration record** for:

- `tinykars.com`
- `tinykars.in`

The same registry endpoints returned records for known registered domains, which supports the result. This means both names **appear available at the time checked**. It does not reserve either name. Domain status can change at any moment, and Cloudflare performs the definitive availability check when **Purchase** is selected.

Purchase `tinykars.com` first. The optional `tinykars.in` can be bought separately and redirected permanently to the `.com` for brand protection.

Registry references: [Verisign RDAP for `.com`](https://rdap.verisign.com/com/v1/domain/tinykars.com), [NIXI RDAP for `.in`](https://rdap.nixiregistry.in/rdap/domain/tinykars.in), [Cloudflare availability process](https://developers.cloudflare.com/registrar/get-started/register-domain/).

## 2. What is needed from the client for Cloudflare

The Cloudflare account must belong to the client business. The freelancer may pay the first-year invoice, but the client should remain the account owner.

The client supplies or enters:

1. A permanent business email address controlled by the client.
2. Client owner's full legal first and last name in English/ASCII characters.
3. Business or residential address, city, state, country and PIN code.
4. Phone number with country code.
5. Organization/legal business name, when applicable.
6. A payment card or accepted payment method, entered directly in Cloudflare.
7. Approval to buy `tinykars.com` for one year and enable auto-renewal.
8. Two-factor authentication, with recovery codes stored offline by the client.
9. A second trusted client administrator for recovery, if available.

The developer needs delegated access after purchase. Do not share the owner's password or OTP. Grant only the permissions needed to manage DNS, Pages/Workers, R2 and deployment.

## 3. How to purchase `tinykars.com`

1. Create the client-owned account at [Cloudflare](https://dash.cloudflare.com/sign-up) using the permanent business email.
2. Verify the account email and enable two-factor authentication.
3. Add the client's billing profile and payment method.
4. Open **Domain Registration → Register Domains**.
5. Search for `tinykars.com`.
6. Confirm availability and review the exact registration and renewal prices.
7. Choose one year. Leave auto-renew enabled unless the client has another documented renewal process.
8. Enter accurate registrant name, email, phone, address, city, state, country and postal code.
9. Review the agreements and complete the purchase.
10. Verify the registrant email immediately. An unverified email can place the domain on hold.
11. Enable DNSSEC.
12. Record the registrar, purchase date, renewal date, account owner and recovery-code location in the handover register.

Cloudflare currently publishes `.com` registration and renewal at **USD 11.17 per year**. Tax, exchange rate and the final cart can change. Successful domain registrations are non-refundable. [Cloudflare `.com` price](https://pricing.registrar.cloudflare.com/?q=com)

## 4. Can everything be hosted on Cloudflare?

### Cheapest Cloudflare-native design

| Need                            | Cloudflare product                  |
| ------------------------------- | ----------------------------------- |
| React website and static assets | Workers Static Assets or Pages      |
| API endpoints                   | Workers                             |
| SQL database                    | D1                                  |
| Product images and exports      | R2                                  |
| Background processing           | Queues, Workflows and Cron Triggers |
| DNS, TLS and domain             | Cloudflare Registrar/DNS            |
| Secrets                         | Worker secrets                      |

For a live payment store, use the **Workers Paid plan**, currently USD 5/month minimum, plus usage above included limits. With a USD 11.17 `.com`, the provider minimum is approximately **USD 71.17 for year one** (about ₹6,780 at the 30 October 2026 RBI reference rate), before tax, card conversion and overages. Transactional email and Razorpay remain external services, so “everything on Cloudflare” does not include the gateway or outbound email provider.

Official references: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

### Effect on the existing code

The current backend is a persistent Node/Fastify service using PostgreSQL, PostgreSQL transactions, row locks, migrations and an in-process email worker. D1 uses SQLite semantics and Workers use a request/event runtime. A Cloudflare-native deployment therefore requires:

- converting PostgreSQL migrations and queries to D1/SQLite;
- replacing row/advisory locks with D1-compatible transaction and idempotency patterns;
- adapting Fastify routes to the Workers request model;
- moving recurring workers to Queues, Workflows or Cron Triggers;
- retesting authentication, inventory, vouchers, checkout, payments and migrations;
- creating a D1 export and restore procedure.

Cloudflare Containers can run Node, but their local disk is ephemeral. They are not a safe shortcut for running PostgreSQL inside the container.

**Launch decision:** Cloudflare-native is the cheapest provider architecture over time, but migration adds material work before 10 November. Until it is completed and tested, the safer path for the existing code is Cloudflare for the domain/frontend/R2 and a persistent Node/PostgreSQL host for the API/database.

## 5. Cloudflare values needed by the developer

After purchase, give access through Cloudflare account membership. The developer will configure:

- Cloudflare account ID;
- zone/domain: `tinykars.com`;
- site: `https://tinykars.com`;
- `www.tinykars.com` redirect;
- API: `https://api.tinykars.com`;
- media: `https://assets.tinykars.com`;
- staging, if used: `https://staging.tinykars.com`;
- R2 bucket and media hostname;
- narrowly scoped deployment API token, if CI is used;
- Workers/D1 identifiers only if the native migration is approved.

API tokens and secrets go into the deployment secret manager. Only public IDs and hostnames belong in documentation.

## 6. Razorpay registration — client preparation

The merchant account must use the business's real legal structure. Do not register an existing company as an individual merely to simplify KYC.

Prepare:

1. Owner/authorized signatory mobile and business email.
2. Legal business type: individual/unregistered, sole proprietor, partnership, LLP, company, trust/society or other supported type.
3. Applicable PAN and identity/address verification.
4. Settlement bank account number and IFSC; names should match applicable KYC records.
5. Bank proof if requested, showing account holder, number and IFSC.
6. Business registration and authority documents applicable to the legal structure.
7. GSTIN when applicable. An eligible no-GST onboarding route does not decide the business's legal GST obligation; the accountant does.
8. Business description: collectible toy/model cars sold online and, if applicable, offline.
9. Business address, customer support details and expected transaction information requested by the dashboard.
10. Website URL and the policy pages in the next section.

| Business type           | Typical preparation                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Individual/unregistered | Personal PAN, identity/address verification and matching bank details; follow Razorpay's category eligibility |
| Sole proprietorship     | Proprietor PAN/KYC, bank details and requested business proofs                                                |
| Partnership/LLP         | Entity PAN, deed/agreement or incorporation records, authority and ownership information                      |
| Company                 | Company PAN, incorporation/CIN records, signatory/board authority and beneficial-owner information            |

Razorpay may retrieve information through CKYC or request more evidence. The dashboard request for the selected entity is authoritative. Activation is subject to Razorpay and banking-partner review, so a date cannot be guaranteed.

References: [Razorpay onboarding checklist](https://razorpay.com/blog/minimum-documents-payment-gateway-onboarding-india/), [Razorpay terms](https://razorpay.com/terms/).

## 7. Website pages for live payment review

Publish accurate, client-approved pages under the `.com` domain:

- About/business identity;
- Contact Us with approved support email, phone and address;
- Terms and Conditions;
- Privacy Policy;
- Shipping and Delivery Policy with service area/timelines;
- Cancellation, Return and Refund Policy with eligibility/timelines;
- real catalogue descriptions, prices and availability;
- checkout showing the payable amount before Razorpay opens.

The policies must match actual operations. The client/accountant/legal adviser owns their business content; the developer implements approved text.

## 8. Razorpay values needed by Tiny Kars

### Test mode first

Place these directly in the staging secret manager:

- `RAZORPAY_KEY_ID` — test Key ID;
- `RAZORPAY_KEY_SECRET` — test Key Secret;
- `RAZORPAY_WEBHOOK_SECRET` — a separate strong secret chosen for the test webhook;
- Merchant ID for support/reconciliation records;
- approved account name displayed at checkout.

Test and live credentials are separate. The Key Secret and webhook secret never belong in frontend code, Git, documentation or chat. The public checkout can receive the Key ID; the Key Secret remains server-side.

### Webhook setup

In Razorpay **Test Mode**, create:

- URL: the staging equivalent of `https://api.tinykars.com/api/webhooks/razorpay`;
- secret: a new strong value stored in the host secret manager;
- currently supported event: `payment.captured`.

Add `payment.failed`, refund and dispute events only when their workflows are implemented. Test and Live Mode webhooks must be configured separately.

### Live mode after activation and website verification

- live `RAZORPAY_KEY_ID`;
- live `RAZORPAY_KEY_SECRET`;
- separate live `RAZORPAY_WEBHOOK_SECRET`;
- enabled methods and auto-capture setting confirmed;
- settlement bank/schedule and merchant fees confirmed;
- dashboard roles and 2FA configured.

Official guidance requires HTTPS, server-side secrets, signature validation, trusted server-side order IDs and captured payment verification. [Razorpay security checklist](https://razorpay.com/security/checklist)

## 9. Integration flow to complete

1. Customer signs in and submits cart, address/PIN and optional voucher.
2. Server reloads prices and stock; it never trusts browser totals.
3. Server applies active shipping, voucher and accountant-approved tax rules.
4. Server creates a pending order and reserves inventory atomically.
5. Server creates a Razorpay Order for the final amount in paise and stores its ID.
6. Browser opens Razorpay Checkout with the public Key ID and server-created order ID.
7. Browser callback is provisional; verify its signature server-side.
8. Validate the raw-body signature of the `payment.captured` webhook.
9. Fetch the payment from Razorpay and match payment/order IDs, amount, currency and captured status.
10. One transaction marks paid, records the event and queues confirmations/invoice work.
11. Duplicate/out-of-order events remain idempotent; mismatches require manual review.
12. Failed/abandoned payments release stock after the approved timeout.
13. Daily reconciliation compares local orders, Razorpay payments/refunds and settlements.

Current code implements server-priced checkout/order creation, stock reservation/expiry, voucher/loyalty/wallet redemption, signed captured-payment reconciliation, immutable invoices, store/source refunds, provider refund refresh, and durable email/WhatsApp outboxes. These workflows still require Razorpay, Meta and email sandbox/live provider tests.

## 10. Go-live evidence

Do not enable live checkout until:

- the domain purchase and registrant email verification are complete;
- HTTPS works for site, API and media;
- Razorpay activation and website verification are complete;
- successful and failed sandbox payments pass;
- tampered signatures are rejected;
- duplicate events produce one paid transition/confirmation;
- mismatched payments do not fulfil orders;
- concurrent checkout cannot oversell;
- voucher rules are enforced atomically;
- a real confirmation email reaches a controlled inbox;
- refund behavior matches published policy;
- backup and restore are tested;
- production secrets are in the host secret manager;
- the client owns all provider accounts and recovery access.

## 11. Immediate actions for 10 November

1. Purchase `tinykars.com` now in the client-owned Cloudflare account.
2. Decide whether to buy `tinykars.in` for brand protection and redirect.
3. Create the Razorpay account with the correct legal entity and start KYC now.
4. Confirm the settlement bank and accountant-approved GST/invoice rules.
5. Approve website policies and customer support details.
6. Add the developer through delegated roles; do not share passwords or OTPs.
7. Provide Gopal Sagar's final CSV and five genuine views per model.
