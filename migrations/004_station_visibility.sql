BEGIN;

ALTER TABLE stations
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE stations
  ADD CONSTRAINT visibility_type_check
    CHECK (visibility IN ('public', 'private'));

COMMIT;
