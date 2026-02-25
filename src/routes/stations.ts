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
    createdAt: station.created_at.toISOString(),
    updatedAt: station.updated_at.toISOString(),
    deletedAt: station.deleted_at?.toISOString() ?? null,
  });
}

/**
 * Station endpoints: create and update.
 *
 * All routes require a valid JWT and tenant context.
 * Tenant scoping is enforced at the SQL level — queries always filter by tenant_id.
 */
export const stationRoutes: FastifyPluginAsync = async (app) => {
  let stationsService: StationsService | undefined;
  const getService = (): StationsService => {
    if (!stationsService) {
      stationsService = new StationsService(getDb());
    }
    return stationsService;
  };

  /**
   * POST /stations
   *
   * Create a new station scoped to the authenticated tenant.
   *
   * Request: { name, external_id?, latitude?, longitude?, status? }
   * Response (201): StationResponse
   *
   * Errors:
   * - 400: validation failure
   * - 401: missing or invalid token
   */
  app.post(
    "/stations",
    { preHandler: [app.verifyJwt, app.verifyTenant] },
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
      });

      return reply.status(201).send(toStationResponse(station));
    },
  );

  /**
   * PATCH /stations/:id
   *
   * Update an existing station within the authenticated tenant.
   * Only fields present in the body are updated.
   *
   * Request: { name?, external_id?, latitude?, longitude?, status? }
   * Response (200): StationResponse
   *
   * Errors:
   * - 400: validation failure
   * - 401: missing or invalid token
   * - 404: station not found or belongs to a different tenant
   */
  app.patch(
    "/stations/:id",
    { preHandler: [app.verifyJwt, app.verifyTenant] },
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
      });

      return reply.send(toStationResponse(station));
    },
  );
};
