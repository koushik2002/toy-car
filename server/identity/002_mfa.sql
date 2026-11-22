ALTER TABLE identity_sessions ADD COLUMN role_at_issue text;
UPDATE identity_sessions s SET role_at_issue=u.role FROM identity_users u WHERE u.id=s.user_id;
ALTER TABLE identity_sessions ALTER COLUMN role_at_issue SET NOT NULL;

CREATE TABLE identity_mfa (
  user_id uuid PRIMARY KEY REFERENCES identity_users(id),
  secret_ciphertext text NOT NULL,
  last_counter bigint NOT NULL DEFAULT -1,
  created_at timestamptz NOT NULL DEFAULT now()
);
