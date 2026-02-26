import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getDb } from "../db/kysely.js";
import { BadRequestError, NotFoundError } from "../http/errors.js";
import {
  CreateTariffZoneBodySchema,
  UpdateTariffZoneBodySchema,
  TariffZoneResponseSchema,
  AddLocationBodySchema,
  AddTariffBodySchema,
} from "../http/schemas/tariff-zones.schemas.js";
import { PaginationQuerySchema, paginatedResponse } from "../http/schemas/pagination.schemas.js";
import {
  createTariffZone,
  findTariffZoneById,
  findTariffZonesByTenant,
  updateTariffZone,
  addLocationToTariffZone,
  removeLocationFromTariffZone,
  addTariffToTariffZone,
  removeTariffFromTariffZone,
} from "../repositories/tariff-zones.repo.js";
import { findLocationById } from "../repositories/locations.repo.js";
import { findTariffById } from "../repositories/tariffs.repo.js";
import type { Selectable } from "kysely";
import type { TariffZonesTable } from "../db/types.js";

function toTariffZoneResponse(zone: Selectable<TariffZonesTable>) {
  return TariffZoneResponseSchema.parse({
    id: zone.id,
    tenantId: zone.tenant_id,
    name: zone.name,
    createdAt: zone.created_at.toISOString(),
    updatedAt: zone.updated_at.toISOString(),
  });
}

/**
 * Tariff zone endpoints (tenant_admin only).
 */
export const tariffZoneRoutes: FastifyPluginAsync = async (app) => {
  const ph = [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])];

  app.post("/tariff-zones", { preHandler: ph }, async (req, reply) => {
    let body;
    try {
      body = CreateTariffZoneBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    const zone = await createTariffZone(getDb(), req.tenantId!, body.name);
    return reply.status(201).send(toTariffZoneResponse(zone));
  });

  app.get("/tariff-zones", { preHandler: ph }, async (req, reply) => {
    const pagination = PaginationQuerySchema.parse(req.query);
    const result = await findTariffZonesByTenant(getDb(), req.tenantId!, pagination);
    return reply.send(paginatedResponse(result.rows.map(toTariffZoneResponse), result.total));
  });

  app.get("/tariff-zones/:id", { preHandler: ph }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const zone = await findTariffZoneById(getDb(), id, req.tenantId!);
    if (!zone) {
      throw new NotFoundError("Tariff zone not found");
    }
    return reply.send(toTariffZoneResponse(zone));
  });

  app.patch("/tariff-zones/:id", { preHandler: ph }, async (req, reply) => {
    const { id } = req.params as { id: string };

    let body;
    try {
      body = UpdateTariffZoneBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    const zone = await updateTariffZone(getDb(), id, req.tenantId!, body.name!);
    if (!zone) {
      throw new NotFoundError("Tariff zone not found");
    }
    return reply.send(toTariffZoneResponse(zone));
  });

  // Locations

  app.post("/tariff-zones/:id/locations", { preHandler: ph }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const zone = await findTariffZoneById(getDb(), id, req.tenantId!);
    if (!zone) {
      throw new NotFoundError("Tariff zone not found");
    }

    let body;
    try {
      body = AddLocationBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    const location = await findLocationById(getDb(), body.location_id, req.tenantId!);
    if (!location) {
      throw new NotFoundError("Location not found");
    }

    await addLocationToTariffZone(getDb(), id, body.location_id);
    return reply.status(204).send();
  });

  app.delete("/tariff-zones/:id/locations/:locationId", { preHandler: ph }, async (req, reply) => {
    const { id, locationId } = req.params as { id: string; locationId: string };

    const zone = await findTariffZoneById(getDb(), id, req.tenantId!);
    if (!zone) {
      throw new NotFoundError("Tariff zone not found");
    }

    const removed = await removeLocationFromTariffZone(getDb(), id, locationId);
    if (!removed) {
      throw new NotFoundError("Location not in this tariff zone");
    }
    return reply.status(204).send();
  });

  // Tariffs

  app.post("/tariff-zones/:id/tariffs", { preHandler: ph }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const zone = await findTariffZoneById(getDb(), id, req.tenantId!);
    if (!zone) {
      throw new NotFoundError("Tariff zone not found");
    }

    let body;
    try {
      body = AddTariffBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    const tariff = await findTariffById(getDb(), body.tariff_id, req.tenantId!);
    if (!tariff) {
      throw new NotFoundError("Tariff not found");
    }

    await addTariffToTariffZone(getDb(), id, body.tariff_id);
    return reply.status(204).send();
  });

  app.delete("/tariff-zones/:id/tariffs/:tariffId", { preHandler: ph }, async (req, reply) => {
    const { id, tariffId } = req.params as { id: string; tariffId: string };

    const zone = await findTariffZoneById(getDb(), id, req.tenantId!);
    if (!zone) {
      throw new NotFoundError("Tariff zone not found");
    }

    const removed = await removeTariffFromTariffZone(getDb(), id, tariffId);
    if (!removed) {
      throw new NotFoundError("Tariff not in this tariff zone");
    }
    return reply.status(204).send();
  });
};
