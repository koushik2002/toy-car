-- Seller billing hardening and append-only invoice corrections.
CREATE INDEX billing_invoices_creator_channel_idx
  ON billing_invoices(created_by, channel, created_at DESC, id DESC);

CREATE UNIQUE INDEX billing_tally_external_reference_unique
  ON billing_tally_jobs(external_id) WHERE external_id IS NOT NULL;

CREATE SEQUENCE billing_correction_number_seq START WITH 1;
CREATE TABLE billing_invoice_corrections (
  id uuid PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES billing_invoices(id),
  correction_number text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('note','credit_note','void_notice')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  amount_paise integer NOT NULL DEFAULT 0 CHECK (amount_paise >= 0),
  created_by uuid NOT NULL REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_invoice_corrections_invoice_idx
  ON billing_invoice_corrections(invoice_id, created_at, id);

CREATE TRIGGER billing_invoice_correction_immutable
  BEFORE UPDATE OR DELETE ON billing_invoice_corrections
  FOR EACH ROW EXECUTE FUNCTION billing_protect_invoice();
