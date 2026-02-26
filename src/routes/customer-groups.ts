import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getDb } from "../db/kysely.js";
import { BadRequestError, NotFoundError } from "../http/errors.js";
import {
  CreateCustomerGroupBodySchema,
  UpdateCustomerGroupBodySchema,
  CustomerGroupResponseSchema,
  AddMemberBodySchema,
  AssignTariffBodySchema,
  AssignTariffZoneBodySchema,
} from "../http/schemas/customer-groups.schemas.js";
import { PaginationQuerySchema, paginatedResponse } from "../http/schemas/pagination.schemas.js";
import {
  createCustomerGroup,
  findCustomerGroupById,
  findCustomerGroupsByTenant,
  updateCustomerGroup,
  addUserToCustomerGroup,
  removeUserFromCustomerGroup,
  assignTariffToCustomerGroup,
  removeTariffFromCustomerGroup,
  assignTariffZoneToCustomerGroup,
  removeTariffZoneFromCustomerGroup,
} from "../repositories/customer-groups.repo.js";
import { findTariffById } from "../repositories/tariffs.repo.js";
import type { Selectable } from "kysely";
import type { CustomerGroupsTable } from "../db/types.js";

function toCustomerGroupResponse(group: Selectable<CustomerGroupsTable>) {
  return CustomerGroupResponseSchema.parse({
    id: group.id,
    tenantId: group.tenant_id,
    name: group.name,
    createdAt: group.created_at.toISOString(),
    updatedAt: group.updated_at.toISOString(),
  });
}

const preHandler = (app: Parameters<FastifyPluginAsync>[0]) => [
  app.verifyJwt,
  app.verifyTenant,
  app.verifyRole(["tenant_admin"]),
];

/**
 * Customer group endpoints (tenant_admin only).
 */
export const customerGroupRoutes: FastifyPluginAsync = async (app) => {
  const ph = preHandler(app);

  app.post("/customer-groups", { preHandler: ph }, async (req, reply) => {
    let body;
    try {
      body = CreateCustomerGroupBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    const group = await createCustomerGroup(getDb(), req.tenantId!, body.name);
    return reply.status(201).send(toCustomerGroupResponse(group));
  });

  app.get("/customer-groups", { preHandler: ph }, async (req, reply) => {
    const pagination = PaginationQuerySchema.parse(req.query);
    const result = await findCustomerGroupsByTenant(getDb(), req.tenantId!, pagination);
    return reply.send(paginatedResponse(result.rows.map(toCustomerGroupResponse), result.total));
  });

  app.get("/customer-groups/:id", { preHandler: ph }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const group = await findCustomerGroupById(getDb(), id, req.tenantId!);
    if (!group) {
      throw new NotFoundError("Customer group not found");
    }
    return reply.send(toCustomerGroupResponse(group));
  });

  app.patch("/customer-groups/:id", { preHandler: ph }, async (req, reply) => {
    const { id } = req.params as { id: string };

    let body;
    try {
      body = UpdateCustomerGroupBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    const group = await updateCustomerGroup(getDb(), id, req.tenantId!, body.name!);
    if (!group) {
      throw new NotFoundError("Customer group not found");
    }
    return reply.send(toCustomerGroupResponse(group));
  });

  // Members

  app.post("/customer-groups/:id/members", { preHandler: ph }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const group = await findCustomerGroupById(getDb(), id, req.tenantId!);
    if (!group) {
      throw new NotFoundError("Customer group not found");
    }

    let body;
    try {
      body = AddMemberBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    await addUserToCustomerGroup(getDb(), id, body.user_id);
    return reply.status(204).send();
  });

  app.delete("/customer-groups/:id/members/:userId", { preHandler: ph }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };

    const group = await findCustomerGroupById(getDb(), id, req.tenantId!);
    if (!group) {
      throw new NotFoundError("Customer group not found");
    }

    const removed = await removeUserFromCustomerGroup(getDb(), id, userId);
    if (!removed) {
      throw new NotFoundError("User is not a member of this group");
    }
    return reply.status(204).send();
  });

  // Tariffs

  app.post("/customer-groups/:id/tariffs", { preHandler: ph }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const group = await findCustomerGroupById(getDb(), id, req.tenantId!);
    if (!group) {
      throw new NotFoundError("Customer group not found");
    }

    let body;
    try {
      body = AssignTariffBodySchema.parse(req.body);
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

    await assignTariffToCustomerGroup(getDb(), id, body.tariff_id);
    return reply.status(204).send();
  });

  app.delete("/customer-groups/:id/tariffs/:tariffId", { preHandler: ph }, async (req, reply) => {
    const { id, tariffId } = req.params as { id: string; tariffId: string };

    const group = await findCustomerGroupById(getDb(), id, req.tenantId!);
    if (!group) {
      throw new NotFoundError("Customer group not found");
    }

    const removed = await removeTariffFromCustomerGroup(getDb(), id, tariffId);
    if (!removed) {
      throw new NotFoundError("Tariff not assigned to this group");
    }
    return reply.status(204).send();
  });

  // Tariff zones

  app.post("/customer-groups/:id/tariff-zones", { preHandler: ph }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const group = await findCustomerGroupById(getDb(), id, req.tenantId!);
    if (!group) {
      throw new NotFoundError("Customer group not found");
    }

    let body;
    try {
      body = AssignTariffZoneBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    await assignTariffZoneToCustomerGroup(getDb(), id, body.tariff_zone_id);
    return reply.status(204).send();
  });

  app.delete(
    "/customer-groups/:id/tariff-zones/:zoneId",
    { preHandler: ph },
    async (req, reply) => {
      const { id, zoneId } = req.params as { id: string; zoneId: string };

      const group = await findCustomerGroupById(getDb(), id, req.tenantId!);
      if (!group) {
        throw new NotFoundError("Customer group not found");
      }

      const removed = await removeTariffZoneFromCustomerGroup(getDb(), id, zoneId);
      if (!removed) {
        throw new NotFoundError("Tariff zone not assigned to this group");
      }
      return reply.status(204).send();
    },
  );
};
