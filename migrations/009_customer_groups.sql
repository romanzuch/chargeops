BEGIN;

CREATE TABLE IF NOT EXISTS customer_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_customer_groups (
  user_id             uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_group_id   uuid        NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_customer_groups_pk PRIMARY KEY (user_id, customer_group_id)
);

COMMIT;
