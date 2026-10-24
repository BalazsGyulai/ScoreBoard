-- Refresh token rotation.
-- The refresh_tokens table exists since 0001 but was never used. Each row is one
-- opaque refresh token (only its SHA-256 hash is stored). Tokens issued from the
-- same login share a family_id; presenting an already-rotated token after the
-- grace window revokes the whole family (token theft detection).
--
-- Idempotent: the API also runs this file on startup.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id  UUID,
  ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL DEFAULT NULL;

UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL;

ALTER TABLE refresh_tokens
  ALTER COLUMN family_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
