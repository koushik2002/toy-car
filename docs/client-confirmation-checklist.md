# Tiny Kars — client confirmation checklist

The super admin will create and maintain operational settings in the dashboard. The client is asked to **confirm the choices**, not prepare a technical specification or enter every value in chat.

1. **Series codes:** Confirm that each brand-and-series pair gets one permanent random six-digit number. Every generated product barcode starts with that number (for example, `482916-P000001`), and every physical car serial starts with it (`482916-U000000001`). The suffix increments so codes never rely on random chance for uniqueness. If two brands have a series with the same name, they currently receive different prefixes. Existing printed codes are not silently renumbered.
2. **Products:** Gopal Sagar supplies the final CSV and five genuine photos for every product. Confirm the five view names/order and whether all five are mandatory before a product is visible.
3. **Shipping:** Confirm whether the current choices cover the business: a fixed charge, charges by delivery PIN-code prefix with a default charge, and an optional free-shipping threshold. The super admin enters the amounts and activates the rule. If another method is required, specify it before checkout opens.
4. **Offers:** Confirm what one-time vouchers mean (one use globally or one use per customer) and whether vouchers can combine with loyalty points or store credit. The super admin will create codes and limits.
5. **Loyalty and refunds:** Confirm whether points expire, whether refunds may go to original payment method or store credit, and who approves each type. The super admin will configure values.
6. **Delivery:** Confirm whether staff confirmation is acceptable for launch and what evidence staff should record; courier integration can be scoped separately if required.
7. **Seller billing:** Confirm what sellers may see, issue, reprint, edit, or cancel. Accountant-approved GST/invoice rules are needed before real bills can be issued.
8. **Customer communication:** Confirm which order events should trigger email and WhatsApp, and approve the wording/templates.
9. **Mobile and launch:** A `.com` is required. Confirm whether `tinykars.com` is available and legally suitable; otherwise select another `.com`. Decide whether to buy the matching `.in` and redirect it to the `.com`. Confirm whether a responsive website satisfies mobile use, plus business contact details, support details, and policy-page content.

Razorpay and email/WhatsApp/Tally service credentials are technical setup items handled separately in client-owned accounts. Never send payment secrets, card details, bank passwords, or OTPs in chat.
