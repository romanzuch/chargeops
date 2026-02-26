BEGIN;

CREATE TABLE IF NOT EXISTS plugs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id      uuid        NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  connector_type  text        NOT NULL
                    CONSTRAINT plugs_connector_type_check
                    CHECK (connector_type IN ('ccs', 'chademo', 'type2', 'type1', 'schuko', 'other')),
  max_power_kw    numeric(10,2) NOT NULL,
  status          text        NOT NULL DEFAULT 'available'
                    CONSTRAINT plugs_status_check
                    CHECK (status IN ('available', 'occupied', 'out_of_service', 'reserved')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS plugs_station_id_idx ON plugs (station_id);

COMMIT;
