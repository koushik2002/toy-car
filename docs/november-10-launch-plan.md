# Tiny Kars — 10 November 2026 target

**Status on 28 October:** November 10 is a target, not an approved live-payment release. A real order can be accepted only after checkout, tax/invoice rules, stock handling, payment and refund reconciliation, and provider tests pass. The storefront currently keeps checkout disabled.

## Critical path

| Date        | Required result                                                                                                          | Owner/dependency                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 30 October  | Final product CSV/photos, shipping and voucher choices, GST/HSN invoice example, Razorpay sandbox account, sender domain | Client, Gopal Sagar, accountant, super admin |
| 3 November  | Server-priced checkout, stock reservation, and signed Razorpay order/payment flow implemented in staging                 | Engineering                                  |
| 6 November  | Voucher redemption, invoice issue/numbering, cancellation and payment exception paths tested                             | Engineering + accountant review              |
| 8 November  | Browser checkout, real sandbox payments, email inbox, catalogue import, backups/restore, mobile and accessibility tests  | Engineering + client accounts                |
| 9 November  | Go/no-go review with rollback procedure and named incident contact                                                       | Client + engineering                         |
| 10 November | Open paid checkout only if every gate passes; otherwise launch browsing/accounts with checkout closed                    | Client                                       |

## Scope truth

The original requirement also includes loyalty points, store-credit and original-method refunds, offline seller billing, WhatsApp automation, Tally integration, and delivery evidence. These are backend work, not configuration switches. They need approved rules, provider accounts, reconciliation tests, and operational ownership. They must not be represented as complete on November 10 unless actually built and verified.

## Cheapest practical hosting shape

- Static React storefront: Cloudflare Pages free tier, within its published limits.
- API and PostgreSQL: Railway Hobby has a **$5/month minimum** that includes $5 of usage; actual compute, memory, volume, backups, and traffic can exceed this. Railway calls Pro ($20/month minimum) its plan for professional production teams. For a payment-enabled launch, budget **at least $20–40/month for API/database and backup usage** until the first real bill establishes actual consumption. This is a planning estimate, not a provider quote.
- Images: R2 Standard has a 10 GB-month free storage allowance and operation limits; verify actual usage.
- Transactional email: Resend Free currently lists 3,000 emails/month and 100/day. Verify sending domain and deliverability.
- Domain: a **`.com` is required**. Cloudflare lists registration and renewal at **$11.17/year**. Check `tinykars.com` availability and legal use before purchase; if unavailable, agree on a different `.com`. At the Railway Hobby minimum, one year of hosting plus this domain is **$71.17 before tax, exchange fees, and usage overages**. Set aside a larger reserve because the $5/month Railway floor may not cover a live API and database.
- Razorpay and Meta WhatsApp usage are separate. Razorpay lists no standard setup/maintenance fee and applies payment transaction fees plus GST under the merchant's agreement.

Official pricing: [Railway](https://docs.railway.com/pricing/plans), [Cloudflare Pages](https://developers.cloudflare.com/pages/functions/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/), [Resend](https://resend.com/pricing), [Cloudflare Registrar](https://pricing.registrar.cloudflare.com/?q=com), [Razorpay](https://razorpay.com/pricing/).
