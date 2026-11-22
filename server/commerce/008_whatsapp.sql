ALTER TABLE commerce_orders ADD COLUMN whatsapp_opt_in boolean NOT NULL DEFAULT false;

ALTER TABLE commerce_notification_outbox
  DROP CONSTRAINT commerce_notification_outbox_kind_check;
ALTER TABLE commerce_notification_outbox
  ADD CONSTRAINT commerce_notification_outbox_kind_check
  CHECK (kind IN ('payment_confirmed','whatsapp_payment_confirmed'));
