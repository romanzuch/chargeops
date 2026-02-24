BEGIN;

ALTER TABLE refresh_tokens
  ADD COLUMN family_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS refresh_tokens_family_id_idx
  ON refresh_tokens (family_id);

COMMIT;
