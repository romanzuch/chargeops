import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getDb } from "../db/kysely.js";
import { BadRequestError, NotFoundError } from "../http/errors.js";
import {
  CreatePlugBodySchema,
  UpdatePlugBodySchema,
  PlugResponseSchema,
} from "../http/schemas/plugs.schemas.js";
import { PaginationQuerySchema, paginatedResponse } from "../http/schemas/pagination.schemas.js";
import {
  createPlug,
  findPlugsByStation,
  findPlugById,
  updatePlug,
  softDeletePlug,
} from "../repositories/plugs.repo.js";
import { findPublicStationById, findStationByIdForTenant } from "../repositories/stations.repo.js";
import type { Selectable } from "kysely";
import type { PlugsTable } from "../db/types.js";

function toPlugResponse(plug: Selectable<PlugsTable>) {
  return PlugResponseSchema.parse({
    id: plug.id,
    stationId: plug.station_id,
    connectorType: plug.connector_type,
    maxPowerKw: Number(plug.max_power_kw),
    status: plug.status,
    createdAt: plug.created_at.toISOString(),
    updatedAt: plug.updated_at.toISOString(),
    deletedAt: plug.deleted_at?.toISOString() ?? null,
  });
}

const ALL_TENANT_ROLES = ["tenant_admin", "tenant_view", "driver"] as const;

/**
 * Plug endpoints.
 *
 * Public read (no auth):
 * - GET /stations/:stationId/plugs       — plugs for a public station
 *
 * Tenant read (JWT + tenant + any role):
 * - GET /tenant/stations/:stationId/plugs — plugs for any tenant station
 *
 * Tenant write (JWT + tenant + tenant_admin):
 * - POST   /stations/:stationId/plugs              — add plug
 * - PATCH  /stations/:stationId/plugs/:plugId      — update plug
 * - DELETE /stations/:stationId/plugs/:plugId      — soft-delete plug
 */
export const plugRoutes: FastifyPluginAsync = async (app) => {
  // ---------------------------------------------------------------------------
  // Public read
  // ---------------------------------------------------------------------------

  app.get("/stations/:stationId/plugs", async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    const pagination = PaginationQuerySchema.parse(req.query);

    const station = await findPublicStationById(getDb(), stationId);
    if (!station) {
      throw new NotFoundError("Station not found");
    }

    const result = await findPlugsByStation(getDb(), stationId, pagination);
    return reply.send(paginatedResponse(result.rows.map(toPlugResponse), result.total));
  });

  // ---------------------------------------------------------------------------
  // Tenant read
  // ---------------------------------------------------------------------------

  app.get(
    "/tenant/stations/:stationId/plugs",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole([...ALL_TENANT_ROLES])] },
    async (req, reply) => {
      const { stationId } = req.params as { stationId: string };
      const pagination = PaginationQuerySchema.parse(req.query);

      const station = await findStationByIdForTenant(getDb(), stationId, req.tenantId!);
      if (!station) {
        throw new NotFoundError("Station not found");
      }

      const result = await findPlugsByStation(getDb(), stationId, pagination);
      return reply.send(paginatedResponse(result.rows.map(toPlugResponse), result.total));
    },
  );

  // ---------------------------------------------------------------------------
  // Tenant write
  // ---------------------------------------------------------------------------

  app.post(
    "/stations/:stationId/plugs",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      const { stationId } = req.params as { stationId: string };

      const station = await findStationByIdForTenant(getDb(), stationId, req.tenantId!);
      if (!station) {
        throw new NotFoundError("Station not found");
      }

      let body;
      try {
        body = CreatePlugBodySchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      const plug = await createPlug(getDb(), {
        stationId,
        connectorType: body.connector_type,
        maxPowerKw: body.max_power_kw,
        ...(body.status !== undefined && { status: body.status }),
      });

      return reply.status(201).send(toPlugResponse(plug));
    },
  );

  app.patch(
    "/stations/:stationId/plugs/:plugId",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      const { stationId, plugId } = req.params as { stationId: string; plugId: string };

      const station = await findStationByIdForTenant(getDb(), stationId, req.tenantId!);
      if (!station) {
        throw new NotFoundError("Station not found");
      }

      let body;
      try {
        body = UpdatePlugBodySchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      const plug = await updatePlug(getDb(), plugId, stationId, {
        ...(body.connector_type !== undefined && { connectorType: body.connector_type }),
        ...(body.max_power_kw !== undefined && { maxPowerKw: body.max_power_kw }),
        ...(body.status !== undefined && { status: body.status }),
      });

      if (!plug) {
        throw new NotFoundError("Plug not found");
      }

      return reply.send(toPlugResponse(plug));
    },
  );

  app.delete(
    "/stations/:stationId/plugs/:plugId",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      const { stationId, plugId } = req.params as { stationId: string; plugId: string };

      const station = await findStationByIdForTenant(getDb(), stationId, req.tenantId!);
      if (!station) {
        throw new NotFoundError("Station not found");
      }

      const deleted = await softDeletePlug(getDb(), plugId, stationId);
      if (!deleted) {
        throw new NotFoundError("Plug not found");
      }

      return reply.status(204).send();
    },
  );
};
