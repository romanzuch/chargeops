import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getDb } from "../db/kysely.js";
import { BadRequestError, NotFoundError } from "../http/errors.js";
import {
  CreateTariffBodySchema,
  UpdateTariffBodySchema,
  TariffResponseSchema,
} from "../http/schemas/tariffs.schemas.js";
import { PaginationQuerySchema, paginatedResponse } from "../http/schemas/pagination.schemas.js";
import {
  createTariff,
  findTariffById,
  findTariffsByTenant,
  updateTariff,
} from "../repositories/tariffs.repo.js";
import type { Selectable } from "kysely";
import type { TariffsTable } from "../db/types.js";

function toTariffResponse(tariff: Selectable<TariffsTable>) {
  return TariffResponseSchema.parse({
    id: tariff.id,
    tenantId: tariff.tenant_id,
    name: tariff.name,
    pricePerKwh: tariff.price_per_kwh !== null ? Number(tariff.price_per_kwh) : null,
    pricePerMinute: tariff.price_per_minute !== null ? Number(tariff.price_per_minute) : null,
    pricePerSession: tariff.price_per_session !== null ? Number(tariff.price_per_session) : null,
    currency: tariff.currency,
    createdAt: tariff.created_at.toISOString(),
    updatedAt: tariff.updated_at.toISOString(),
    deletedAt: tariff.deleted_at?.toISOString() ?? null,
  });
}

const ALL_TENANT_ROLES = ["tenant_admin", "tenant_view", "driver"] as const;

/**
 * Tariff endpoints (tenant-scoped).
 *
 * Reads: any tenant role
 * Writes: tenant_admin only
 */
export const tariffRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/tariffs",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      let body;
      try {
        body = CreateTariffBodySchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      const tariff = await createTariff(getDb(), {
        tenantId: req.tenantId!,
        name: body.name,
        ...(body.price_per_kwh !== undefined && { pricePerKwh: body.price_per_kwh }),
        ...(body.price_per_minute !== undefined && { pricePerMinute: body.price_per_minute }),
        ...(body.price_per_session !== undefined && { pricePerSession: body.price_per_session }),
        ...(body.currency !== undefined && { currency: body.currency }),
      });

      return reply.status(201).send(toTariffResponse(tariff));
    },
  );

  app.get(
    "/tariffs",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole([...ALL_TENANT_ROLES])] },
    async (req, reply) => {
      const pagination = PaginationQuerySchema.parse(req.query);
      const result = await findTariffsByTenant(getDb(), req.tenantId!, pagination);
      return reply.send(paginatedResponse(result.rows.map(toTariffResponse), result.total));
    },
  );

  app.get(
    "/tariffs/:id",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole([...ALL_TENANT_ROLES])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const tariff = await findTariffById(getDb(), id, req.tenantId!);
      if (!tariff) {
        throw new NotFoundError("Tariff not found");
      }
      return reply.send(toTariffResponse(tariff));
    },
  );

  app.patch(
    "/tariffs/:id",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      let body;
      try {
        body = UpdateTariffBodySchema.parse(req.body);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
        }
        throw err;
      }

      const tariff = await updateTariff(getDb(), id, req.tenantId!, {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.price_per_kwh !== undefined && { pricePerKwh: body.price_per_kwh }),
        ...(body.price_per_minute !== undefined && { pricePerMinute: body.price_per_minute }),
        ...(body.price_per_session !== undefined && { pricePerSession: body.price_per_session }),
        ...(body.currency !== undefined && { currency: body.currency }),
      });

      if (!tariff) {
        throw new NotFoundError("Tariff not found");
      }

      return reply.send(toTariffResponse(tariff));
    },
  );
};
