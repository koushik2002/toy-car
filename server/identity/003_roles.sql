CREATE TABLE identity_mfa_pending (
  user_id uuid PRIMARY KEY REFERENCES identity_users(id) ON DELETE CASCADE,
  secret_ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_mfa_pending_expiry_idx ON identity_mfa_pending(expires_at);
