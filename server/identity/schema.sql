CREATE TABLE identity_users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'seller', 'staff', 'admin', 'super_admin')),
  email_verified_at timestamptz,
  disabled_at timestamptz,
  auth_version integer NOT NULL DEFAULT 1 CHECK (auth_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity_users(id),
  auth_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX identity_sessions_user_idx ON identity_sessions(user_id);
CREATE INDEX identity_sessions_expiry_idx ON identity_sessions(expires_at);

CREATE TABLE identity_tokens (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity_users(id),
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX identity_tokens_user_purpose_idx ON identity_tokens(user_id, purpose);

CREATE TABLE identity_outbox (
  id uuid PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('verify_email', 'reset_password')),
  encrypted_payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_owner uuid,
  provider_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX identity_outbox_pending_idx ON identity_outbox(status, available_at);

CREATE TABLE identity_throttle (
  key_hash char(64) PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0)
);

CREATE TABLE identity_audit_log (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES identity_users(id),
  action text NOT NULL,
  entity_id uuid,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX identity_audit_actor_idx ON identity_audit_log(actor_id, created_at DESC);

CREATE FUNCTION identity_protect_audit_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit entries are append-only';
END;
$$;
CREATE TRIGGER identity_audit_immutable BEFORE UPDATE OR DELETE ON identity_audit_log
  FOR EACH ROW EXECUTE FUNCTION identity_protect_audit_log();
