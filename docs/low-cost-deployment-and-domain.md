# Tiny Kars — low-cost deployment and domain recommendation

Status: recommended baseline<br>
Prices checked: 28 October 2026<br>
Currency note: vendor prices, taxes, exchange rates, promotions, and usage change. Recheck the checkout page before purchase.

For the exact client inputs, domain-purchase steps, Cloudflare-native hosting decision and Razorpay onboarding/integration values, use [Cloudflare and Razorpay client handoff](cloudflare-and-razorpay-client-handoff.md).

## 1. Recommended production stack

For a small initial store, use a managed, cost-conscious architecture:

| Layer               | Recommendation                                                              | Why                                                                                                          |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Domain and DNS      | Client-owned `.com` through Cloudflare Registrar; Cloudflare DNS            | Required extension, published renewal price, DNSSEC, CDN, and clear ownership                                |
| Storefront          | Cloudflare Pages                                                            | Static React hosting, global CDN, preview deployments, SSL, custom domain                                    |
| API and worker      | Railway Pro for live production; Hobby only for development/pilot           | Simple TypeScript/Docker deployment, private service networking, cron, logs, predictable starting commitment |
| Database            | PostgreSQL on Railway initially                                             | One provider and private network; enable backups and PITR; easiest operational path                          |
| Background jobs     | PostgreSQL-backed jobs such as `pg-boss`                                    | Avoid a separate Redis bill until traffic proves it is needed                                                |
| Product media       | Cloudflare R2                                                               | S3-compatible, inexpensive storage, free direct egress, useful free tier                                     |
| Transactional email | Resend or another verified-domain transactional provider                    | Simple API, SPF/DKIM/DMARC, order/reset emails                                                               |
| Payments            | Razorpay hosted checkout                                                    | Keeps sensitive payment entry outside Tiny Kars application code                                             |
| WhatsApp            | Meta WhatsApp Business Platform or approved BSP                             | Payment/order confirmation templates and delivery status                                                     |
| Monitoring          | Railway metrics plus Better Stack or an equivalent commercial-eligible plan | Uptime, cron heartbeat, logs/errors at small-store scale                                                     |
| Accounting          | Small outbound Tally bridge on the shop PC/network                          | No public Tally port; durable cloud-to-local sync                                                            |

### Why this is cheaper without being careless

- Static storefront hosting can remain on a free CDN tier.
- PostgreSQL performs transactions and also backs the initial durable job queue, so Redis is postponed.
- Product images use R2's free/low-cost tier rather than application disk.
- The API, worker, and database stay on one private network initially.
- Managed deployment avoids paying a freelancer every month to patch and recover a hand-built server.
- Payment and message provider charges remain usage-based and separate from hosting.

## 2. Expected starting cost

### Development and client demo

- Existing GitHub Pages demo: ₹0 hosting.
- Cloudflare Pages preview/staging: normally ₹0 within the free limits.
- Test-mode Razorpay: no real payment processing.
- Provider sandboxes/test numbers where available.

Do not accept real orders, real customer credentials, or live payments on the browser-only prototype.

### Small live production store

- Cloudflare Pages: likely ₹0 at initial traffic.
- Railway Pro: currently a USD 20 minimum monthly usage commitment; actual use above included credit is billed additionally.
- R2: likely ₹0 while within the current 10 GB/month standard-storage free tier; then usage-based.
- Transactional email: free tier may cover a small launch; upgrade based on volume/deliverability needs.
- Monitoring: use a free tier only when its current terms permit this commercial site; otherwise use the smallest suitable paid plan.
- Required `.com` domain: Cloudflare currently lists USD 11.17 for registration and renewal; confirm availability and final checkout price.
- Razorpay and WhatsApp: usage-based pass-through charges.

A responsible low-volume launch should budget roughly USD 20–60 per month in fixed/usage-based infrastructure before tax, payment-gateway charges, WhatsApp charges, SMS/OTP, premium email, or unusually high traffic. This is a planning band, not a guaranteed invoice.

This low-cost baseline uses recovery-oriented single-node PostgreSQL unless high availability is enabled. It is production-capable for a small launch with backups, PITR, monitoring, and a tested restore, but it is not a zero-downtime design. Add database high availability when the business cost of an outage justifies the additional nodes.

### Very cheapest cash-cost alternative

A single VPS can run the API, PostgreSQL, worker, and reverse proxy for less cash. It also creates a single failure domain and requires OS patching, firewalling, database tuning, offsite backups, restore drills, alerting, and emergency maintenance. It is reasonable only when someone is contractually responsible for operations. It is not the recommended default for a payment-enabled store managed by nontechnical owners.

### Hostinger 24-month KVM option for the freelancer-funded launch

The freelancer is willing to prepay a longer hosting term while the client takes over domain renewals from year two. Hostinger currently advertises KVM 1 at **₹14,376 paid upfront for 24 months**, with renewal shown at **₹999/month equivalent on the same term**. The KVM offer's free-domain list does not include `.com` or `.in`, so budget both desired domains separately. Prices and eligibility must be confirmed in the checkout cart before purchase. Hostinger's weekly VPS snapshot is not a replacement for daily offsite PostgreSQL dumps and a restore test. The client should own the Hostinger account even when the freelancer funds the first purchase.

At current listed prices, a planning example is ₹14,376 for KVM 1, approximately ₹1,000 for a `.com` registered at Cloudflare, and ₹549 for a `.in` registered at Hostinger: **about ₹15,925 paid upfront before tax, card conversion, backup storage, and any provider charges**. The VPS is prepaid through month 24; the client pays both domain renewals in year two, and the next VPS renewal is due after month 24. If the client will reimburse year-two hosting that was prepaid, state that amount separately in the contract.

Official sources: [Hostinger KVM pricing](https://www.hostinger.com/in/vps-hosting), [KVM free-domain extensions](https://www.hostinger.com/support/8317599-what-free-domains-are-available-at-hostinger/), [Hostinger `.in` pricing](https://www.hostinger.com/in/tutorials/how-to-buy-a-domain-name/), [Cloudflare `.com` pricing](https://pricing.registrar.cloudflare.com/?q=com).

## 3. Domain recommendation

The client requires a `.com` domain and is considering the matching `.in` as well. Check `tinykars.com` first. If unavailable or legally unsuitable, agree on another clear `.com` name such as `shoptinykars.com` or `tinykarsstore.com` after checking trademarks and social handles. Buy the matching `.in` only if available and useful for brand protection; redirect it permanently to the primary `.com`. Do not substitute `.in` for the launch's primary `.com` without a new client decision. Availability is not confirmed by this document.

Do not choose a confusing spelling merely because its first-year price is ₹1. Renewal price and customer trust matter more than the introductory promotion.

Current examples from official public pages:

- Cloudflare lists `.com` at USD 11.17 for registration and renewal on its current price table.
- Hostinger's current promotional pages and domain tutorial show different `.com` first-year and renewal figures; use the final 12-month cart price if considering Hostinger.
- Always verify the exact domain, term, tax, privacy, and renewal price in the final cart.

## 4. Domain ownership checklist

The domain is a business asset. It must be purchased in the client's own account—not the freelancer's account.

- Use the owner's permanent business email and phone.
- Enable two-factor authentication and save recovery codes offline.
- Enable auto-renew and add a backup payment method.
- Turn on registrar lock and DNSSEC where supported.
- Give the developer delegated DNS access instead of account ownership.
- Record registrar, renewal date, account owner, DNS provider, and recovery procedure.
- Keep the Git repository, Cloudflare, Railway, Razorpay, Meta, email provider, and Tally bridge accounts owned by the client organisation.

## 5. Domain and service layout

Recommended public names:

```text
tinykars.com                     customer storefront, if available
www.tinykars.com                 redirect to the primary domain
api.tinykars.com                 production API
assets.tinykars.com              product media through R2/custom domain
status.tinykars.com              optional public status page
```

Admin and seller areas can live under `/admin` and `/seller` in the same frontend. A separate subdomain does not create security; backend authentication and permissions do.

Use `staging.tinykars.com` and a separate staging database/provider keys for pre-production testing. Protect staging with access control and disallow search indexing.

## 6. Email setup

Use a dedicated sending subdomain such as `notify.tinykars.com` so transactional reputation is isolated from staff mail.

Configure and verify:

- SPF;
- DKIM;
- DMARC, starting with monitoring and tightening after validation;
- sender addresses such as `orders@tinykars.com` and `support@tinykars.com`;
- bounce/complaint webhooks;
- order, refund, delivery, and password-reset templates;
- no secrets or unnecessary personal information in messages.

## 7. Production deployment layout

The code currently deployable for review includes catalogue/account administration, shipping, vouchers, server-priced Razorpay checkout, order/delivery workflows, loyalty and wallet ledgers, refunds, seller billing and printable invoices, finance/billing/Tally management screens, durable WhatsApp/email outboxes, Tally connector jobs and R2 media integration. Provider activation, GST/HSN approval and real infrastructure tests remain. The diagram below shows the intended live architecture.

For the current slice, use one Railway API service. It runs the encrypted email outbox poller in the same process, avoiding another service charge while traffic is low. Set its start command to `npm run start:api`, its health path to `/api/health/ready`, and inject `NODE_ENV=production`, `DATABASE_URL`, `PUBLIC_WEB_URL`, `ALLOWED_ORIGINS`, `OUTBOX_ENCRYPTION_KEY`, `RESEND_API_KEY`, and `EMAIL_FROM` as private environment variables. Supply `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` together only when testing the webhook in the merchant sandbox; keep them in host secrets. The API applies checksum-checked migrations before it listens. Use separate databases and encryption keys for staging and production.

For Cloudflare Pages, set the build command to `npm ci && npm run build`, output directory `dist`, and build variable `VITE_API_BASE_URL=https://api.<primary-domain>/api`. Point the storefront custom domain to Pages and the `api` subdomain to Railway. The frontend and API hostnames must share the same registrable domain for the secure account cookie, and `ALLOWED_ORIGINS` must exactly list the storefront origin. The existing GitHub Pages workflow keeps publishing the **demo build** at `/toy-car/`; it is not the production storefront.

Cloudflare Pages serves the root SPA for unknown navigation paths when no top-level `404.html` is present, so direct links to `/account/verify` and `/account/reset` can load the React route. [Cloudflare Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)

Connect a verified Resend sending domain before allowing live registration. Send real verification and reset emails to controlled inboxes, inspect delivery and bounce events, and confirm that expired/reused links fail. Configure backups, alerts, and a restore drill before calling the service live. No production account, DNS record, or paid resource has been created by this repository.

```text
GitHub main branch
  ├─ Cloudflare Pages -> React storefront/admin/seller UI
  └─ Railway
       ├─ API service
       ├─ worker service
       ├─ scheduled maintenance/backup jobs
       └─ PostgreSQL on private network

Cloudflare R2 <- signed image uploads and generated variants
Razorpay -> signed webhook -> API -> PostgreSQL outbox
Worker -> WhatsApp / email / Tally bridge jobs
Shop computer -> outbound-authenticated Tally bridge -> local TallyPrime
```

## 8. Deployment gates

Before live traffic:

1. Production and staging are separate.
2. No secret appears in Git history, frontend variables, logs, or documentation.
3. Database migrations run automatically with a safe rollback/forward-fix plan.
4. Daily backups, point-in-time recovery where available, and an off-provider logical dump are enabled.
5. A restore drill has been completed and timed.
6. Health checks, uptime monitoring, worker heartbeat, payment reconciliation, and error alerts are active.
7. Razorpay webhook signature verification and duplicate-event tests pass.
8. Domain, SSL, DNSSEC, SPF, DKIM, and DMARC are verified.
9. Admin MFA, seller permissions, rate limiting, secure cookies, and reset-password expiry are verified.
10. Legal pages, refund policy, privacy policy, business contact details, tax/invoice settings, and accountant approval are complete.
11. A rollback procedure and named incident contact exist.
12. The client owns every production account and has a credential handover record.

## 9. Scaling triggers

Do not pay for complexity before it is needed. Upgrade when measurements justify it:

- add Redis when PostgreSQL job throughput/latency becomes a measured constraint;
- split API and worker resources when background jobs affect checkout latency;
- add database high availability when downtime cost justifies multiple nodes;
- move to a higher Railway plan/support tier when the store needs stronger targets or a team workspace;
- add image CDN transformations or higher R2 usage only as catalogue/traffic grows;
- add a courier integration when staff delivery confirmation becomes operationally expensive;
- build native mobile applications only when PWA data proves a need.

## 10. Official pricing references

- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Registrar prices](https://pricing.registrar.cloudflare.com/)
- [Railway pricing](https://railway.com/pricing)
- [Railway PostgreSQL and backups](https://docs.railway.com/databases/postgresql)
- [Railway restore strategy](https://docs.railway.com/guides/postgres-backups-restores)
- [Resend pricing](https://resend.com/pricing)
- [Hostinger India domain pricing example](https://www.hostinger.com/in/tutorials/how-to-buy-a-domain-name/)
