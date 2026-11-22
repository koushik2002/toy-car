ALTER TABLE catalogue_products
  ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 3
    CHECK (low_stock_threshold BETWEEN 0 AND 10000);

ALTER TABLE identity_users ADD COLUMN phone text NOT NULL DEFAULT ''
  CHECK (phone = '' OR phone ~ '^\+?[1-9][0-9]{7,14}$');

CREATE SEQUENCE commerce_order_number_seq START WITH 1001;
ALTER TABLE commerce_orders ADD COLUMN order_number text UNIQUE;
UPDATE commerce_orders
   SET order_number = 'TK-' || to_char(created_at, 'YYYY') || '-' || nextval('commerce_order_number_seq')
 WHERE order_number IS NULL;
ALTER TABLE commerce_orders
  ALTER COLUMN order_number SET DEFAULT ('TK-' || to_char(now(), 'YYYY') || '-' || nextval('commerce_order_number_seq')),
  ALTER COLUMN order_number SET NOT NULL;

ALTER TABLE commerce_orders
  ADD COLUMN courier text NOT NULL DEFAULT '' CHECK (char_length(courier) <= 100),
  ADD COLUMN tracking_number text NOT NULL DEFAULT '' CHECK (char_length(tracking_number) <= 100),
  ADD COLUMN delivery_recipient text NOT NULL DEFAULT '' CHECK (char_length(delivery_recipient) <= 120);

CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES identity_users(id),
  recipient_name text NOT NULL CHECK (char_length(recipient_name) BETWEEN 2 AND 120),
  phone text NOT NULL CHECK (phone ~ '^\+?[1-9][0-9]{7,14}$'),
  line1 text NOT NULL CHECK (char_length(line1) BETWEEN 3 AND 200),
  line2 text NOT NULL DEFAULT '' CHECK (char_length(line2) <= 200),
  city text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 100),
  state text NOT NULL CHECK (char_length(state) BETWEEN 2 AND 100),
  postal_code text NOT NULL CHECK (postal_code ~ '^[1-9][0-9]{5}$'),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_customer_idx ON customer_addresses(customer_id, created_at);
CREATE UNIQUE INDEX customer_one_default_address ON customer_addresses(customer_id) WHERE is_default;

CREATE TABLE customer_wishlist (
  customer_id uuid NOT NULL REFERENCES identity_users(id),
  product_id uuid NOT NULL REFERENCES catalogue_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);

CREATE TABLE catalogue_restock_requests (
  customer_id uuid NOT NULL REFERENCES identity_users(id),
  product_id uuid NOT NULL REFERENCES catalogue_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  PRIMARY KEY (customer_id, product_id)
);

CREATE TABLE commerce_order_requests (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES commerce_orders(id),
  customer_id uuid NOT NULL REFERENCES identity_users(id),
  kind text NOT NULL CHECK (kind IN ('cancel', 'return')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  resolution_note text NOT NULL DEFAULT '' CHECK (char_length(resolution_note) <= 1000),
  resolved_by uuid REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX commerce_one_open_request ON commerce_order_requests(order_id) WHERE status = 'open';
CREATE INDEX commerce_order_requests_status_idx ON commerce_order_requests(status, created_at DESC);

-- Counter-sale details. Issued invoices stay immutable; these columns are written once at issue.
ALTER TABLE billing_invoices
  ADD COLUMN customer_address text NOT NULL DEFAULT '' CHECK (char_length(customer_address) <= 500),
  ADD COLUMN payment_method text NOT NULL DEFAULT ''
    CHECK (payment_method IN ('', 'cash', 'upi', 'card', 'bank_transfer', 'online')),
  ADD COLUMN note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500);
ALTER TABLE billing_invoice_items
  ADD COLUMN hsn text NOT NULL DEFAULT '' CHECK (hsn = '' OR hsn ~ '^[0-9]{4,8}$');

ALTER TABLE commerce_notification_outbox
  DROP CONSTRAINT commerce_notification_outbox_kind_check;
ALTER TABLE commerce_notification_outbox
  ADD CONSTRAINT commerce_notification_outbox_kind_check
  CHECK (kind IN ('payment_confirmed', 'whatsapp_payment_confirmed', 'order_shipped', 'order_delivered'));
