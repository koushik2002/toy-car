ALTER TABLE billing_invoices
  DROP CONSTRAINT billing_invoices_payment_method_check,
  ADD CONSTRAINT billing_invoices_payment_method_check
    CHECK (payment_method IN ('', 'cash', 'upi', 'card', 'bank_transfer', 'online', 'test'));
