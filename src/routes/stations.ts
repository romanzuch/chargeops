import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getDb } from "../db/kysely.js";
import { BadRequestError } from "../http/errors.js";
import {
  CreateStationBodySchema,
  UpdateStationBodySchema,
  StationResponseSchema,
} from "../http/schemas/stations.schemas.js";
import { PaginationQuerySchema, paginatedResponse } from "../http/schemas/pagination.schemas.js";
import { StationsService } from "../services/stations.service.js";
import type { Selectable } from "kysely";
import type { StationsTable } from "../db/types.js";

function toStationResponse(station: Selectable<StationsTable>) {
  return StationResponseSchema.parse({
    id: station.id,
    tenantId: station.tenant_id,
    name: station.name,
    externalId: station.external_id,
    locationId: station.location_id,
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
 * - GET /stations         — all public stations across all tenants (paginated)
 * - GET /stations/:id     — single public station
 *
 * Tenant read endpoints (JWT + tenant context + any role):
 * - GET /tenant/stations       — all stations in the user's tenant (paginated, incl. private)
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

  app.get("/stations", async (req, reply) => {
    const pagination = PaginationQuerySchema.parse(req.query);
    const result = await getService().getPublicStations(pagination);
    return reply.send(paginatedResponse(result.rows.map(toStationResponse), result.total));
  });

  app.get("/stations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const station = await getService().getPublicStation(id);
    return reply.send(toStationResponse(station));
  });

  // ---------------------------------------------------------------------------
  // Tenant read endpoints — any authenticated tenant role
  // ---------------------------------------------------------------------------

  app.get(
    "/tenant/stations",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole([...ALL_TENANT_ROLES])] },
    async (req, reply) => {
      const pagination = PaginationQuerySchema.parse(req.query);
      const result = await getService().getTenantStations(req.tenantId!, pagination);
      return reply.send(paginatedResponse(result.rows.map(toStationResponse), result.total));
    },
  );

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
        ...(body.location_id !== undefined && { locationId: body.location_id }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.visibility !== undefined && { visibility: body.visibility }),
      });

      return reply.status(201).send(toStationResponse(station));
    },
  );

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
        ...(body.location_id !== undefined && { locationId: body.location_id }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.visibility !== undefined && { visibility: body.visibility }),
      });

      return reply.send(toStationResponse(station));
    },
  );
};
