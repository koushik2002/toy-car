# Tiny Kars — chat-derived production requirements

Status: client scope baseline<br>
Prepared: 26 October 2026<br>
Source boundary: only the supplied WhatsApp notes plus the later request that the website be interactive, user-friendly, and understandable to a layperson

Later confirmed by the user: email/password sign-in with email verification and password reset; Razorpay is the intended payment gateway; the super admin creates and manages commercial rules in the dashboard, while the client confirms the choices. Each product series receives a persistent random numeric prefix, and generated codes begin with it. Sandbox keys and the approved rule values are pending.

## 1. Purpose

This document converts the chat into a clear product brief without silently adding new business features. Security, testing, accessibility, backups, audit trails, and payment correctness are treated as production engineering obligations, not as extra business scope.

## 2. Complete requirement list

### Customer storefront and account

1. Customers must be able to see products added to the website.
2. The website must have customer sign-up.
3. The website must have customer login.
4. The website must support reset password and show a clear authorisation-success result.
5. After login, the customer must have a way to see the shipping amount during checkout.
6. Customers must be able to see past order history.
7. Customers must be able to see delivery/order progress.
8. The website must preserve all filters shown in the existing demo.

### Checkout, payments, and confirmations

9. Integrate a payment gateway.
10. Once payment is confirmed, send a WhatsApp message and an email.
11. Meta/WhatsApp Business should use its pay-as-you-go mechanism for payment/order confirmations.
12. The system must support delivery confirmation.
13. If automated delivery confirmation is not selected, authorised staff must be able to confirm delivery.

### Products and media

14. Store product name as a separate field.
15. Store brand as a separate field.
16. Store price as a separate field.
17. Store year of manufacture as a separate field.
18. Store series as a separate field.
19. Final product data will be shared by Gopal Sagar.
20. Each product must support previews from all sides using five product images/views.
21. Exact names/order for the five views must be confirmed by the client; the chat specifies five views but does not name them.

### Product import, codes, and labels

22. Admin must be able to upload products in bulk using CSV.
23. During CSV upload, products without a supplied unique code must receive a generated unique product number/SKU or barcode.
24. Products must be mapped to printable product serial codes.
25. Admin must be able to print those codes from the admin dashboard.
26. The exact distinction between one code per product model and one serial per physical piece must be confirmed. The production design should support both SKU-level and unit-level identification without pretending they are the same.

### Promotions and loyalty

27. The website must support customisable loyalty points.
28. Admin must be able to configure the loyalty mechanism.
29. Admin must be able to create and manage discount vouchers.
30. Discount vouchers must support one-time-use codes.
31. The meaning of “one-time” must be confirmed: once globally, once per customer, or one uniquely generated code per recipient.

### Refunds and store credits

32. Admin must be able to manage refunds.
33. The refund mechanism must support customer store credit/wallet credit.
34. Store credits must be available for future purchases.
35. The chat says “store the credentials as well,” but it does not define which credentials. This is a clarification item. The system must never store card numbers, CVV, UPI PINs, bank passwords, or payment-gateway secret keys as customer data. It may store safe gateway transaction/reference IDs and wallet ledger records.

### Billing and invoicing

36. The system must support billing on web and mobile.
37. The billing system must integrate/synchronise with Tally.
38. Admin must have a secure login.
39. The system must support offline/manual billing sales.
40. Offline sales must be identifiable separately from online sales.
41. Online sales must also have invoice numbers/serial numbers.
42. Manual/offline invoices and online invoices must be available to authorised users.

### Seller access

43. Seller must have a separate login.
44. Seller access must be limited.
45. Seller must have read access to information needed for billing.
46. Seller must be able to generate bills.
47. Seller must not receive unrestricted admin powers.

### User experience and interaction

48. The website must be more interactive than a basic catalogue.
49. The website must be user-friendly for people who are not technically experienced.
50. A first-time shopper must understand what to do without training.
51. The experience must work clearly on mobile as well as desktop.
52. Interactions must help the user complete shopping, checkout, payment, and order tracking; animation must not become visual noise.

## 3. UX interpretation of “a layperson can understand it”

This requirement means the production design must include:

- familiar words such as “Add to cart,” “Buy now,” “Delivery address,” and “Pay securely” instead of internal jargon;
- visible prices, stock state, delivery expectation, shipping amount, discount, and final total;
- one obvious primary action per screen;
- a short, numbered checkout flow with progress shown;
- labels next to icons; important actions cannot be icon-only;
- inline validation that explains how to correct a mistake;
- search suggestions and filters that are easy to clear;
- useful empty, loading, success, failure, and no-results states;
- order status shown as a plain-language timeline;
- confirmation before destructive actions such as cancellation or refund;
- large touch targets, readable type, adequate contrast, keyboard navigation, and screen-reader labels;
- motion used for feedback and orientation, with reduced-motion support;
- no hidden fees: shipping, discount, tax if applicable, wallet credit, and payable total are visible before payment;
- help text/tooltips only where a normal user could reasonably be confused;
- a mobile-first layout tested with first-time users, not only with the development team.

## 4. Role summary from the chat

| Role     | Required capabilities                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer | Browse products, sign up/login/reset password, see shipping, pay, receive confirmations, view past orders/delivery, use permitted vouchers/loyalty/store credit |
| Seller   | Separate login, limited read access for billing, generate permitted manual/offline bills                                                                        |
| Admin    | Login, manage products/CSV/codes, print serial labels, manage vouchers/loyalty/refunds/store credits, manage orders/delivery, billing, and Tally operations     |
| Staff    | Confirm delivery when the chosen delivery workflow uses staff confirmation; exact role separation from admin is to be decided                                   |

## 5. Production acceptance outcomes

These outcomes make the chat requirements testable without adding business scope.

1. A new user can find a product, understand it, create an account, see shipping, pay, and locate the confirmed order without verbal help.
2. A confirmed payment produces one order and queues one WhatsApp and one email confirmation even when the gateway retries its webhook.
3. Refreshing, double-clicking, or receiving duplicate callbacks does not create duplicate payments, orders, refunds, vouchers, invoices, or serial assignments.
4. A customer can access only their own account, wallet, and orders.
5. A seller can generate an allowed bill but cannot edit protected admin data.
6. Admin can upload a CSV, see row errors before commit, generate required codes, and print labels.
7. Product pages show five client-approved image views.
8. Voucher use, loyalty, wallet credit, refunds, invoice numbers, inventory codes, and delivery changes remain traceable.
9. Offline and online sales are separately reportable and both can produce invoices.
10. Tally downtime does not make a successfully paid customer order disappear; failed sync is visible and retryable.
11. The interface passes agreed mobile, accessibility, performance, and first-time-user checks.

## 6. Clarifications required from the client

The chat does not answer these questions. They must not be guessed silently.

1. Are products visible without login, or does “products added — signup” mean login is mandatory to browse?
2. Is authentication phone OTP, email/password, or both?
3. Who configures the shipping amount, and is it flat, pincode-based, order-value-based, or manually entered?
4. Which payment gateway is final? The chat later mentions Razorpay, so confirm it explicitly.
5. Which WhatsApp setup will be used: Meta Cloud API directly or a Business Solution Provider?
6. What are the five required image views and are all five mandatory before publishing?
7. Does each product model need one SKU/barcode, or does each physical piece need its own serial/barcode?
8. What are the loyalty earning, redemption, expiry, minimum-order, cap, and stacking rules?
9. What exactly does one-time voucher mean?
10. Can the customer choose original-method refund versus store credit, or does admin decide?
11. What did “store the credentials” mean? No sensitive payment credentials will be stored.
12. What can a seller view, discount, edit, cancel, or reprint?
13. Is mobile satisfied by an installable responsive website/PWA, or is a separately published Android/iOS app required?
14. What confirms delivery: courier integration, customer OTP, or staff action?
15. What TallyPrime version/company/ledgers/voucher types are used, and which system controls stock?
16. What GST, HSN, invoice numbering, financial-year, return, and credit-note rules have been approved by the accountant?
17. What are the expected number of products, physical units, monthly online orders, daily bills, sellers, and admins?

## 7. Scope control

The chat does not request a marketplace, multiple vendors, subscriptions, auctions, social network, live chat bot, warehouse-routing engine, multilingual content, native mobile application, or advanced courier aggregator. Do not add them to the base quote unless the client separately approves them.

Production engineering necessities—secure authentication, server-side permissions, database transactions, payment verification, audit logs, backups, monitoring, accessibility, privacy, and testing—are required to deliver the listed features safely and are not optional “extra screens.”
