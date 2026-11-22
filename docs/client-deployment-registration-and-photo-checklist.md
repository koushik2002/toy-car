# Tiny Kars — client deployment, registration and product-photo checklist

Prepared: 6 November 2026

This is the single non-technical checklist for the client. Provider accounts must be owned by the
client. Passwords, OTPs, card details, bank passwords, PAN/Aadhaar files and secret keys must be
entered directly into the provider dashboards and must not be sent through chat or committed to
the website code.

## 1. Cloudflare account and domain purchase

The client must complete or approve:

- Create a Cloudflare account using a permanent business email controlled by the client.
- Enable two-factor authentication and save recovery codes offline.
- Add the client's legal name, address, phone number, billing profile and payment method.
- Search for and approve the final `.com` domain. Purchase it for at least one year and enable
  auto-renewal. The final price and availability shown at checkout are authoritative.
- Optionally purchase the matching `.in` domain and redirect it to the `.com`.
- Verify the domain registrant email immediately after purchase.
- Invite the developer as a limited team member. Do not share the owner's password or OTP.
- Nominate one second trusted client administrator for account recovery.

The developer will configure:

- The main website, normally `https://tinykars.com`.
- A permanent `www` redirect to the chosen main address.
- `api.tinykars.com` for the application API.
- `assets.tinykars.com` for product photographs stored in Cloudflare R2.
- `staging.tinykars.com` for safe payment and content testing before launch.
- HTTPS, DNSSEC, cache rules, security headers and least-privilege deployment access.
- An R2 bucket, its public media hostname, upload credentials and retention/CORS rules.
- Deployment secrets inside the hosting dashboard, never in frontend code.

### Hosting decision required

The current application uses Node/Fastify and PostgreSQL. The client must approve one of these:

1. **Recommended for the fastest launch:** Cloudflare for the domain, DNS, frontend and R2 images;
   a low-cost managed Node host and PostgreSQL service for the API and database.
2. **Cloudflare-only:** migrate the backend to Workers/D1 and repeat payment, inventory,
   concurrency, migration and restore testing. This is additional engineering work, not a simple
   hosting switch.

## 2. Business and website information

The client supplies and approves:

- Legal/business name and business type.
- Business address and, if applicable, GSTIN and registration details.
- Customer-support email, phone number, WhatsApp number and working hours.
- Return address and delivery service area.
- About Us, Contact Us, Terms, Privacy, Shipping, Cancellation, Return and Refund policy text.
- Shipping charges/free-shipping rule, voucher rules, loyalty rules and refund/store-credit rules.
- Accountant-approved invoice name, numbering prefix, GST/HSN/tax treatment and a sample invoice.
- Names and email addresses of the initial super admin, sellers, staff and admins.

The super admin enters approved operational values in the dashboard. The developer must not invent
tax, return, loyalty or shipping policies.

## 3. Razorpay registration and activation

The Razorpay account must belong to the business receiving the money. The client prepares:

- Authorized owner's/signatory's mobile number and business email.
- Correct legal business type and legal name.
- PAN/KYC and address evidence requested for that business type.
- Settlement bank account number, IFSC and matching account-holder proof.
- Business registration/authority documents requested by Razorpay.
- GSTIN when applicable, based on accountant advice.
- Business description: online and offline sale of collectible toy/model cars.
- Live website URL, support contacts, product catalogue, prices and all policy pages.
- Expected ticket size, transaction volume and delivery/refund information requested during review.

After test access is available, the client or account owner enters credentials directly into the
deployment secret manager. The developer needs:

- Test Key ID and Test Key Secret.
- A separately generated test webhook secret.
- Merchant/account ID for reconciliation records.
- Approval of enabled payment methods, capture behavior and settlement account.
- After activation, separate Live Key ID, Live Key Secret and live webhook secret.

The developer configures the Razorpay webhook at the deployed API URL and performs successful,
failed, cancelled, duplicate, delayed, mismatched and refund tests. Live checkout remains disabled
until a controlled live payment, settlement check and refund drill pass.

## 4. Email, WhatsApp and Tally accounts

The client supplies or creates:

- A sending email/domain and a client-owned transactional-email account.
- Meta Business/WhatsApp Business access, sender number, approved customer opt-in wording and an
  approved order-confirmation template.
- TallyPrime version, company name, invoice/voucher type, sales/customer/tax ledgers, stock-item
  mapping and the Windows computer/person responsible for the connector.

The developer configures provider credentials, DNS verification records, templates, retry handling
and staging tests. Provider secrets must be stored only in the deployment secret manager.

## 5. Product CSV and five photographs per product

Gopal Sagar/client provides the final product spreadsheet with one row per model:

- Product name, brand, series, manufacture year, price and MRP.
- Scale, condition, description, stock quantity and whether each physical unit needs a serial.
- Existing SKU/barcode if one must be retained; otherwise Tiny Kars generates series-based codes.

For every model, provide five genuine photographs in the agreed order:

1. Front three-quarter view.
2. Rear three-quarter view.
3. Left side.
4. Right side.
5. Top/interior/packaging detail, as agreed for that product type.

Photo requirements:

- One car/model per image, with the photograph matching the spreadsheet item exactly.
- Sharp, evenly lit, color-accurate and free from watermarks, screenshots or supplier UI.
- Consistent neutral background and orientation across the catalogue.
- Original JPEG, PNG, WebP, AVIF or HEIF file; do not send photographs inside Word/PDF files.
- At least 1600 px on the longest side is preferred; keep the original high-quality file.
- File naming: `BRAND-SERIES-MODEL-view-1` through `view-5`.
- Written confirmation that Tiny Kars has permission to publish the images.
- A mapping sheet if filenames do not exactly match the product SKU/name.

The admin upload screen accepts and optimizes the images. A product is not published until all five
required views are present. The client must visually approve cropping, view order, colors and mobile
appearance before launch.

## 6. Final client sign-off before public launch

- Domain ownership, renewal, MFA and recovery access confirmed.
- Real catalogue, stock and five images per product approved.
- Razorpay KYC activated and test/live credentials entered securely.
- Policies, support details, shipping, loyalty, vouchers and refunds approved.
- Accountant approves invoices, taxes and Tally mappings.
- Staging payment, email, WhatsApp, invoice, refund and Tally tests accepted.
- Database backup and restore drill completed.
- Monitoring/alerts and an incident contact are active.
- Client signs off on desktop and mobile acceptance testing.
