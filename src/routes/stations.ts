import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getDb } from "../db/kysely.js";
import { BadRequestError } from "../http/errors.js";
import {
  CreateStationBodySchema,
  UpdateStationBodySchema,
  StationResponseSchema,
} from "../http/schemas/stations.schemas.js";
import { StationsService } from "../services/stations.service.js";
import type { Selectable } from "kysely";
import type { StationsTable } from "../db/types.js";

function toStationResponse(station: Selectable<StationsTable>) {
  return StationResponseSchema.parse({
    id: station.id,
    tenantId: station.tenant_id,
    name: station.name,
    externalId: station.external_id,
    latitude: station.latitude,
    longitude: station.longitude,
    status: station.status,
    visibility: station.visibility,
    createdAt: station.created_at.toISOString(),
    updatedAt: station.updated_at.toISOString(),
    deletedAt: station.deleted_at?.toISOString() ?? null,
  });
}

const ALL_TENANT_ROLES = ["tenant_admin", "tenant_view", "driver"] as const;

/**
 * Station endpoints.
 *
 * Public read endpoints (no auth required):
 * - GET /stations         — all public stations across all tenants
 * - GET /stations/:id     — single public station
 *
 * Tenant read endpoints (JWT + tenant context + any role):
 * - GET /tenant/stations       — all stations in the user's tenant (incl. private)
 * - GET /tenant/stations/:id   — single station in the user's tenant (incl. private)
 *
 * Tenant write endpoints (JWT + tenant context + tenant_admin role only):
 * - POST /stations        — create a station
 * - PATCH /stations/:id   — update a station
 */
export const stationRoutes: FastifyPluginAsync = async (app) => {
  let stationsService: StationsService | undefined;
  const getService = (): StationsService => {
    if (!stationsService) {
      stationsService = new StationsService(getDb());
    }
    return stationsService;
  };

  // ---------------------------------------------------------------------------
  // Public read endpoints — no authentication required
  // ---------------------------------------------------------------------------

  /**
   * GET /stations
   *
   * Returns all public stations across all tenants.
   *
   * Response (200): StationResponse[]
   */
  app.get("/stations", async (_req, reply) => {
    const stations = await getService().getPublicStations();
    return reply.send(stations.map(toStationResponse));
  });

  /**
   * GET /stations/:id
   *
   * Returns a single public station by ID.
   * Returns 404 for private stations or non-existent IDs.
   *
   * Response (200): StationResponse
   *
   * Errors:
   * - 404: station not found or not public
   */
  app.get("/stations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const station = await getService().getPublicStation(id);
    return reply.send(toStationResponse(station));
  });

  // ---------------------------------------------------------------------------
  // Tenant read endpoints — any authenticated tenant role (tenant_admin,
  // tenant_view, driver). Intended for the driver mobile app and backoffice.
  // ---------------------------------------------------------------------------

  /**
   * GET /tenant/stations
   *
   * Returns all stations in the authenticated user's tenant, including private
   * ones. Accessible to all tenant roles (tenant_admin, tenant_view, driver).
   *
   * Response (200): StationResponse[]
   *
   * Errors:
   * - 401: missing or invalid token
   * - 403: insufficient role
   */
  app.get(
    "/tenant/stations",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole([...ALL_TENANT_ROLES])] },
    async (req, reply) => {
      const stations = await getService().getTenantStations(req.tenantId!);
      return reply.send(stations.map(toStationResponse));
    },
  );

  /**
   * GET /tenant/stations/:id
   *
   * Returns a single station by ID within the authenticated user's tenant,
   * including private ones.
   *
   * Response (200): StationResponse
   *
   * Errors:
   * - 401: missing or invalid token
   * - 403: insufficient role
   * - 404: station not found or belongs to a different tenant
   */
  app.get(
    "/tenant/stations/:id",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole([...ALL_TENANT_ROLES])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const station = await getService().getTenantStation(id, req.tenantId!);
      return reply.send(toStationResponse(station));
    },
  );

  // ---------------------------------------------------------------------------
  // Tenant write endpoints — tenant_admin only
  // ---------------------------------------------------------------------------

  /**
   * POST /stations
   *
   * Create a new station scoped to the authenticated tenant.
   * Requires the `tenant_admin` role.
   *
   * Request: { name, external_id?, latitude?, longitude?, status?, visibility? }
   * Response (201): StationResponse
   *
   * Errors:
   * - 400: validation failure
   * - 401: missing or invalid token
   * - 403: requires tenant_admin role
   */
  app.post(
    "/stations",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      let body;
      try {
        body = CreateStationBodySchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      const station = await getService().createStation(req.tenantId!, {
        name: body.name,
        ...(body.external_id !== undefined && { externalId: body.external_id }),
        ...(body.latitude !== undefined && { latitude: body.latitude }),
        ...(body.longitude !== undefined && { longitude: body.longitude }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.visibility !== undefined && { visibility: body.visibility }),
      });

      return reply.status(201).send(toStationResponse(station));
    },
  );

  /**
   * PATCH /stations/:id
   *
   * Update an existing station within the authenticated tenant.
   * Only fields present in the body are updated.
   * Requires the `tenant_admin` role.
   *
   * Request: { name?, external_id?, latitude?, longitude?, status?, visibility? }
   * Response (200): StationResponse
   *
   * Errors:
   * - 400: validation failure
   * - 401: missing or invalid token
   * - 403: requires tenant_admin role
   * - 404: station not found or belongs to a different tenant
   */
  app.patch(
    "/stations/:id",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      let body;
      try {
        body = UpdateStationBodySchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      const station = await getService().updateStation(id, req.tenantId!, {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.external_id !== undefined && { externalId: body.external_id }),
        ...(body.latitude !== undefined && { latitude: body.latitude }),
        ...(body.longitude !== undefined && { longitude: body.longitude }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.visibility !== undefined && { visibility: body.visibility }),
      });

      return reply.send(toStationResponse(station));
    },
  );
};
