# Tiny Kars — what we need from you before launch

Prepared: 6 November 2026

The website now looks and works like the demo you approved, using real accounts, real orders and
secure payments. Product photos are **labelled sample photos** until your real ones arrive. Each
question below shows the default we have built. If the default is right, you only need to say
"confirmed".

Never send passwords, OTPs, card numbers, bank passwords or secret keys in chat or email. Enter them
directly in the provider's dashboard or our secret manager when we ask.

## 1. Decisions about how the shop works

| #   | Question                                                                                                                                  | What is built today (default)                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Can people **browse products without signing in** (as in the demo), or must they sign in first?                                           | Sign-in first. Public browsing is one setting (`PUBLIC_BROWSING=1`) and needs no new work.                                                                                                  |
| 2   | Do you want the demo's automatic offers **"Any 3 for ₹550"** and **"Buy 2, get 1 free"**? If yes, which products and the exact rules.     | Not active. Products can carry an offer label, but no automatic bundle discount is applied. Vouchers work.                                                                                  |
| 3   | Shipping: one flat charge, a charge by PIN-code area, or by order value? Free-delivery threshold? Where do you deliver and how many days? | Flat ₹79, free above ₹1,499 (as in the demo). PIN-code-area pricing is also available. The super admin can change these.                                                                    |
| 4   | Discount codes: "one-time" means once in total, or once per customer? Can a code be combined with loyalty points or store credit?         | Both options exist per code. Codes, points and store credit can currently be combined in one order.                                                                                         |
| 5   | Loyalty points: points per ₹100, value of one point, minimum and maximum per order, expiry, and whether points are reversed on refund.    | All except expiry are set by the super admin. Points are reversed on a full refund. No expiry yet.                                                                                          |
| 6   | Refunds: to store credit or to the original payment method by default? Who approves? Return window?                                       | Admin chooses either method for each refund. Customers can request a return within **7 days** of delivery and cancel before packing.                                                        |
| 7   | "Store the credentials as well" — what did this mean?                                                                                     | We store payment reference IDs only. We never store card, UPI PIN or bank details.                                                                                                          |
| 8   | Delivery: is staff confirmation enough? What should staff record? Which courier do you use?                                               | Admin enters courier and tracking ID when shipping; staff confirm delivery with "received by" and a note. No courier integration.                                                           |
| 9   | Seller permissions: can sellers see prices and stock, give discounts, add items not in the catalogue, reprint, or cancel bills?           | Sellers can see products and stock, issue bills, add shipping, address, payment method and note, and reprint. Only admins can discount or add custom items. Nobody can edit an issued bill. |
| 10  | Counter sales: which payment methods? Barcode scanner at the counter (model)?                                                             | Cash, UPI, card, bank transfer. Scanner support is not built yet.                                                                                                                           |
| 11  | Which events should send email and WhatsApp? Please approve the wording.                                                                  | Email: payment confirmed, shipped, delivered. WhatsApp: payment confirmed only (needs a Meta-approved template).                                                                            |
| 12  | Barcodes: one code per product model, or one per physical car? Label size and printer model?                                              | Both exist: every model has a code; "serial tracking" products get one code per car. Labels print on A4 sheets.                                                                             |
| 13  | Is a mobile-friendly website enough, or do you need an Android/iOS app?                                                                   | Mobile-friendly website.                                                                                                                                                                    |
| 14  | Product photos: the five views, in order. Must all five exist before a product can go live?                                               | Front three-quarter, rear three-quarter, side, front detail, roof/interior. All five are required to publish.                                                                               |
| 15  | Sign-in security for your team: is email and password enough for admins, or do you want a code from a phone app as well?                  | Email and password only. Use long, unique passwords for admin accounts.                                                                                                                     |

## 2. Information and content we need

- Gopal Sagar's final product spreadsheet. Download the template from **Control room → Products → Download template**. Columns: name, brand, series, manufacture_year, scale, condition, price and mrp **in rupees**, stock, low_stock_threshold, rare (yes/no), offer, serial_tracking (yes/no), description, and existing SKU/barcode if you want to keep it.
- Five real photographs for every product (see 1.14), with permission to publish them.
- The brands and series you want in the menus, and the home page spotlight car and banner wording.
- Business legal name, address, GSTIN (if any), support email, phone, WhatsApp number and working hours.
- Policy pages: Terms, Privacy, Shipping, Cancellation, Returns and Refunds.
- **From your accountant:** GST rate(s), HSN codes, whether prices include GST, invoice prefix and numbering, financial-year reset, credit-note format and a sample invoice.
- Names and email addresses of the super admin, admins, delivery staff and sellers.
- Expected volumes: number of products, physical cars, online orders per month, counter bills per day.

## 3. Accounts you own (we configure them with you)

1. Domain (`.com`) and Cloudflare account, with two-factor login.
2. Hosting approval: Cloudflare for the website plus a managed Node/PostgreSQL host (recommended), or a Cloudflare-only rebuild (extra work).
3. **Razorpay** business account and KYC. Then test keys and webhook secret, then live keys.
4. Email sending account (Resend) and domain verification.
5. **Meta WhatsApp Business**: sender number, approved order template and opt-in wording.
6. **TallyPrime**: version, company name, ledgers, voucher type, stock-item mapping, and the Windows PC and person who will run the connector.

## 4. Sign-off before going live

- Real catalogue and photos imported and approved on desktop and mobile.
- Razorpay test payments, failures and a refund drill passed; then one small live payment and refund.
- Email and WhatsApp messages received on real phones/inboxes.
- Accountant approves a printed invoice and the Tally entries.
- Database backup and restore drill completed; monitoring contact named.
- Sample products withdrawn (`npm run seed:samples -- --withdraw`).
