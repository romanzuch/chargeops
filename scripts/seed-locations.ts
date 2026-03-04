/**
 * Seed script: create 20 example locations in Berlin with varying numbers of stations.
 *
 * Usage:
 *   TENANT_ID=<uuid> npx tsx scripts/seed-locations.ts
 *
 * Reads DATABASE_URL from .env (via dotenv) or environment.
 * Idempotent: skips locations that already exist by name for the tenant.
 */

import "dotenv/config";
import { getDb } from "../src/db/kysely.js";

const tenantId = process.env.TENANT_ID?.trim();

if (!tenantId) {
  console.error("Error: TENANT_ID is not set.");
  console.error("Usage: TENANT_ID=<uuid> npx tsx scripts/seed-locations.ts");
  process.exit(1);
}

const LOCATIONS: {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  stationCount: number;
}[] = [
  { name: "Alexanderplatz",          address: "Alexanderplatz 1, 10178 Berlin",                  latitude: 52.5219, longitude: 13.4132, stationCount: 1  },
  { name: "Potsdamer Platz",         address: "Potsdamer Platz 1, 10785 Berlin",                 latitude: 52.5096, longitude: 13.3759, stationCount: 2  },
  { name: "Berliner Dom",            address: "Am Lustgarten, 10178 Berlin",                     latitude: 52.5190, longitude: 13.4014, stationCount: 3  },
  { name: "Checkpoint Charlie",      address: "Friedrichstr. 43–45, 10117 Berlin",               latitude: 52.5075, longitude: 13.3904, stationCount: 4  },
  { name: "Tiergarten Mitte",        address: "Straße des 17. Juni 135, 10623 Berlin",           latitude: 52.5145, longitude: 13.3501, stationCount: 5  },
  { name: "East Side Gallery",       address: "Mühlenstr. 3–100, 10243 Berlin",                  latitude: 52.5050, longitude: 13.4399, stationCount: 6  },
  { name: "Prenzlauer Berg",         address: "Kollwitzplatz, 10405 Berlin",                     latitude: 52.5368, longitude: 13.4153, stationCount: 7  },
  { name: "Kreuzberg Central",       address: "Oranienplatz 1, 10999 Berlin",                    latitude: 52.4993, longitude: 13.4177, stationCount: 8  },
  { name: "Friedrichshain Park",     address: "Volkspark Friedrichshain, 10249 Berlin",          latitude: 52.5276, longitude: 13.4434, stationCount: 9  },
  { name: "Neukölln Nord",           address: "Karl-Marx-Platz, 12043 Berlin",                   latitude: 52.4832, longitude: 13.4335, stationCount: 10 },
  { name: "Tempelhof Feld",          address: "Tempelhofer Damm 1–7, 12101 Berlin",              latitude: 52.4731, longitude: 13.4026, stationCount: 11 },
  { name: "Schöneberg Rathaus",      address: "John-F.-Kennedy-Platz, 10825 Berlin",             latitude: 52.4847, longitude: 13.3437, stationCount: 12 },
  { name: "Charlottenburg Schloss",  address: "Spandauer Damm 10–22, 14059 Berlin",              latitude: 52.5206, longitude: 13.2958, stationCount: 13 },
  { name: "Spandau Altstadt",        address: "Am Juliusturm 64, 13599 Berlin",                  latitude: 52.5356, longitude: 13.2000, stationCount: 14 },
  { name: "Mitte Hackescher Markt",  address: "Hackescher Markt 1, 10178 Berlin",                latitude: 52.5233, longitude: 13.4020, stationCount: 15 },
  { name: "Wedding Leopoldplatz",    address: "Leopoldplatz, 13353 Berlin",                      latitude: 52.5487, longitude: 13.3601, stationCount: 16 },
  { name: "Reinickendorf Center",    address: "Alt-Reinickendorf 29, 13407 Berlin",              latitude: 52.5822, longitude: 13.3381, stationCount: 17 },
  { name: "Lichtenberg Weitlingkiez", address: "Weitlingstr. 22, 10317 Berlin",                 latitude: 52.5131, longitude: 13.4976, stationCount: 18 },
  { name: "Marzahn Promenade",       address: "Marzahner Promenade 28, 12679 Berlin",            latitude: 52.5435, longitude: 13.5748, stationCount: 19 },
  { name: "Köpenick Altstadt",       address: "Alt Köpenick 31, 12555 Berlin",                   latitude: 52.4579, longitude: 13.5761, stationCount: 20 },
];

const CONNECTOR_TYPES = ["ccs", "chademo", "type2", "type1", "schuko"] as const;
const STATION_STATUSES = ["active", "active", "active", "planning", "inactive"] as const; // weighted toward active

const db = getDb();

try {
  // Verify tenant exists
  const tenant = await db
    .selectFrom("tenants")
    .select(["id", "name"])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) {
    console.error(`Error: tenant ${tenantId} not found.`);
    process.exit(1);
  }

  console.log(`Seeding data for tenant: ${tenant.name} (${tenant.id})\n`);

  let locationsCreated = 0;
  let locationsSkipped = 0;
  let stationsCreated = 0;
  let plugsCreated = 0;

  for (const loc of LOCATIONS) {
    // Check if location already exists
    const existing = await db
      .selectFrom("locations")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("name", "=", loc.name)
      .executeTakeFirst();

    if (existing) {
      console.log(`  SKIP location "${loc.name}" (already exists)`);
      locationsSkipped++;
      continue;
    }

    // Insert location
    const location = await db
      .insertInto("locations")
      .values({
        tenant_id: tenantId,
        name: loc.name,
        address: loc.address,
        city: "Berlin",
        country: "DE",
        latitude: loc.latitude,
        longitude: loc.longitude,
        visibility: "public",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    locationsCreated++;
    console.log(`  + location "${loc.name}" → ${loc.stationCount} station(s)`);

    // Insert stations for this location
    for (let i = 1; i <= loc.stationCount; i++) {
      const status = STATION_STATUSES[i % STATION_STATUSES.length];
      const station = await db
        .insertInto("stations")
        .values({
          tenant_id: tenantId,
          location_id: location.id,
          name: `${loc.name} — Station ${i}`,
          external_id: `EXT-${loc.name.slice(0, 3).toUpperCase()}-${String(i).padStart(3, "0")}`,
          status,
          visibility: "public",
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      stationsCreated++;

      // Add 1–3 plugs per station
      const plugCount = (i % 3) + 1;
      for (let p = 0; p < plugCount; p++) {
        const connectorType = CONNECTOR_TYPES[(i + p) % CONNECTOR_TYPES.length];
        const maxPowerKw = [11, 22, 50, 100, 150, 350][(i + p) % 6];
        await db
          .insertInto("plugs")
          .values({
            station_id: station.id,
            connector_type: connectorType,
            max_power_kw: maxPowerKw,
            status: "available",
          })
          .execute();

        plugsCreated++;
      }
    }
  }

  console.log(`\nDone!`);
  console.log(`  Locations: ${locationsCreated} created, ${locationsSkipped} skipped`);
  console.log(`  Stations:  ${stationsCreated} created`);
  console.log(`  Plugs:     ${plugsCreated} created`);
} finally {
  await db.destroy();
}
