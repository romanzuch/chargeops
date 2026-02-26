BEGIN;

CREATE TABLE IF NOT EXISTS tariff_zones (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Which locations are in a tariff zone
CREATE TABLE IF NOT EXISTS tariff_zone_locations (
  tariff_zone_id  uuid  NOT NULL REFERENCES tariff_zones(id) ON DELETE CASCADE,
  location_id     uuid  NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tariff_zone_locations_pk PRIMARY KEY (tariff_zone_id, location_id)
);

-- Which tariffs apply in a tariff zone
CREATE TABLE IF NOT EXISTS tariff_zone_tariffs (
  tariff_zone_id  uuid  NOT NULL REFERENCES tariff_zones(id) ON DELETE CASCADE,
  tariff_id       uuid  NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tariff_zone_tariffs_pk PRIMARY KEY (tariff_zone_id, tariff_id)
);

-- Which tariff zones a customer group has access to (drives location visibility)
CREATE TABLE IF NOT EXISTS customer_group_tariff_zones (
  customer_group_id   uuid  NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  tariff_zone_id      uuid  NOT NULL REFERENCES tariff_zones(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_group_tariff_zones_pk PRIMARY KEY (customer_group_id, tariff_zone_id)
);

-- Which tariffs are directly assigned to a customer group (pricing override)
CREATE TABLE IF NOT EXISTS customer_group_tariffs (
  customer_group_id   uuid  NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  tariff_id           uuid  NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_group_tariffs_pk PRIMARY KEY (customer_group_id, tariff_id)
);

COMMIT;
