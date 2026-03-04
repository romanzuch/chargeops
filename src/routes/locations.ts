import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getDb } from "../db/kysely.js";
import { BadRequestError } from "../http/errors.js";
import {
  CreateLocationBodySchema,
  UpdateLocationBodySchema,
  LocationResponseSchema,
} from "../http/schemas/locations.schemas.js";
import { PaginationQuerySchema, paginatedResponse } from "../http/schemas/pagination.schemas.js";
import { LocationsService, type LocationWithStations, type StationWithPlugs } from "../services/locations.service.js";
import type { Selectable } from "kysely";
import type { LocationsTable } from "../db/types.js";

function toLocationResponse(
  location: Selectable<LocationsTable>,
  stations?: StationWithPlugs[],
) {
  return LocationResponseSchema.parse({
    id: location.id,
    tenantId: location.tenant_id,
    name: location.name,
    address: location.address,
    city: location.city,
    country: location.country,
    latitude: location.latitude,
    longitude: location.longitude,
    visibility: location.visibility,
    createdAt: location.created_at.toISOString(),
    updatedAt: location.updated_at.toISOString(),
    deletedAt: location.deleted_at?.toISOString() ?? null,
    stations: stations?.map(({ station: s, plugs }) => ({
      id: s.id,
      name: s.name,
      externalId: s.external_id,
      status: s.status,
      visibility: s.visibility,
      createdAt: s.created_at.toISOString(),
      updatedAt: s.updated_at.toISOString(),
      deletedAt: s.deleted_at?.toISOString() ?? null,
      plugs: plugs.map((p) => ({
        id: p.id,
        connectorType: p.connector_type,
        maxPowerKw: p.max_power_kw,
        status: p.status,
        createdAt: p.created_at.toISOString(),
        updatedAt: p.updated_at.toISOString(),
        deletedAt: p.deleted_at?.toISOString() ?? null,
      })),
    })),
  });
}

function toLocationWithStationsResponse({ location, stations }: LocationWithStations) {
  return toLocationResponse(location, stations);
}

const ALL_TENANT_ROLES = ["tenant_admin", "tenant_view", "driver"] as const;

/**
 * Location endpoints.
 *
 * Public read (no auth):
 * - GET /locations        — paginated public locations
 * - GET /locations/:id    — single public location
 *
 * Tenant read (JWT + tenant + any role):
 * - GET /tenant/locations       — all tenant locations (accessible to user)
 * - GET /tenant/locations/:id   — single tenant location
 *
 * Tenant write (JWT + tenant + tenant_admin):
 * - POST   /locations         — create
 * - PATCH  /locations/:id     — update
 * - DELETE /locations/:id     — soft-delete
 */
export const locationRoutes: FastifyPluginAsync = async (app) => {
  let locationsService: LocationsService | undefined;
  const getService = (): LocationsService => {
    if (!locationsService) {
      locationsService = new LocationsService(getDb());
    }
    return locationsService;
  };

  // ---------------------------------------------------------------------------
  // Public read endpoints
  // ---------------------------------------------------------------------------

  app.get("/locations", async (req, reply) => {
    const pagination = PaginationQuerySchema.parse(req.query);
    const result = await getService().getPublicLocations(pagination);
    return reply.send(paginatedResponse(result.rows.map((loc) => toLocationResponse(loc)), result.total));
  });

  app.get("/locations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await getService().getPublicLocation(id);
    return reply.send(toLocationWithStationsResponse(result));
  });

  // ---------------------------------------------------------------------------
  // Tenant read endpoints
  // ---------------------------------------------------------------------------

  app.get(
    "/tenant/locations",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole([...ALL_TENANT_ROLES])] },
    async (req, reply) => {
      const pagination = PaginationQuerySchema.parse(req.query);
      const result = await getService().getAccessibleLocations(
        req.tenantId!,
        req.jwtUser!.sub,
        pagination,
      );
      return reply.send(paginatedResponse(result.rows.map((loc) => toLocationResponse(loc)), result.total));
    },
  );

  app.get(
    "/tenant/locations/:id",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole([...ALL_TENANT_ROLES])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await getService().getTenantLocation(id, req.tenantId!);
      return reply.send(toLocationWithStationsResponse(result));
    },
  );

  // ---------------------------------------------------------------------------
  // Tenant write endpoints
  // ---------------------------------------------------------------------------

  app.post(
    "/locations",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      let body;
      try {
        body = CreateLocationBodySchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      const location = await getService().createLocation(req.tenantId!, {
        name: body.name,
        ...(body.address !== undefined && { address: body.address }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.country !== undefined && { country: body.country }),
        ...(body.latitude !== undefined && { latitude: body.latitude }),
        ...(body.longitude !== undefined && { longitude: body.longitude }),
        ...(body.visibility !== undefined && { visibility: body.visibility }),
      });

      return reply.status(201).send(toLocationResponse(location));
    },
  );

  app.patch(
    "/locations/:id",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      let body;
      try {
        body = UpdateLocationBodySchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      const location = await getService().updateLocation(id, req.tenantId!, {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.country !== undefined && { country: body.country }),
        ...(body.latitude !== undefined && { latitude: body.latitude }),
        ...(body.longitude !== undefined && { longitude: body.longitude }),
        ...(body.visibility !== undefined && { visibility: body.visibility }),
      });

      return reply.send(toLocationResponse(location));
    },
  );

  app.delete(
    "/locations/:id",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await getService().deleteLocation(id, req.tenantId!);
      return reply.status(204).send();
    },
  );
};
