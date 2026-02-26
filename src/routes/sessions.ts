import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getDb } from "../db/kysely.js";
import { BadRequestError } from "../http/errors.js";
import { StartSessionBodySchema, SessionResponseSchema } from "../http/schemas/sessions.schemas.js";
import { PaginationQuerySchema, paginatedResponse } from "../http/schemas/pagination.schemas.js";
import { SessionsService } from "../services/sessions.service.js";
import type { Selectable } from "kysely";
import type { ChargingSessionsTable } from "../db/types.js";

function toSessionResponse(session: Selectable<ChargingSessionsTable>) {
  return SessionResponseSchema.parse({
    id: session.id,
    userId: session.user_id,
    plugId: session.plug_id,
    tenantId: session.tenant_id,
    tariffId: session.tariff_id,
    startedAt: session.started_at.toISOString(),
    endedAt: session.ended_at?.toISOString() ?? null,
    energyKwh: session.energy_kwh !== null ? Number(session.energy_kwh) : null,
    cost: session.cost !== null ? Number(session.cost) : null,
    currency: session.currency,
    status: session.status,
    createdAt: session.created_at.toISOString(),
    updatedAt: session.updated_at.toISOString(),
  });
}

const ALL_TENANT_ROLES = ["tenant_admin", "tenant_view", "driver"] as const;

/**
 * Charging session endpoints.
 *
 * - POST   /sessions              — start a session (any tenant role)
 * - GET    /sessions              — list caller's own sessions (any tenant role)
 * - GET    /sessions/:id          — get one session (owner or tenant_admin)
 * - PATCH  /sessions/:id/end      — end active session (own sessions only)
 * - GET    /tenant/sessions       — all sessions for the tenant (tenant_admin)
 */
export const sessionRoutes: FastifyPluginAsync = async (app) => {
  let sessionsService: SessionsService | undefined;
  const getService = (): SessionsService => {
    if (!sessionsService) {
      sessionsService = new SessionsService(getDb());
    }
    return sessionsService;
  };

  const anyTenantRole = [app.verifyJwt, app.verifyTenant, app.verifyRole([...ALL_TENANT_ROLES])];

  app.post("/sessions", { preHandler: anyTenantRole }, async (req, reply) => {
    let body;
    try {
      body = StartSessionBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    const session = await getService().startSession(req.jwtUser!.sub, req.tenantId!, body.plug_id);

    return reply.status(201).send(toSessionResponse(session));
  });

  app.get("/sessions", { preHandler: anyTenantRole }, async (req, reply) => {
    const pagination = PaginationQuerySchema.parse(req.query);
    const result = await getService().getUserSessions(req.jwtUser!.sub, req.tenantId!, pagination);
    return reply.send(paginatedResponse(result.rows.map(toSessionResponse), result.total));
  });

  app.get("/sessions/:id", { preHandler: anyTenantRole }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const isAdmin = req.userRole === "tenant_admin";
    const session = await getService().getSession(id, req.jwtUser!.sub, req.tenantId!, isAdmin);
    return reply.send(toSessionResponse(session));
  });

  app.patch("/sessions/:id/end", { preHandler: anyTenantRole }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await getService().endSession(id, req.jwtUser!.sub, req.tenantId!);
    return reply.send(toSessionResponse(session));
  });

  app.get(
    "/tenant/sessions",
    { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])] },
    async (req, reply) => {
      const pagination = PaginationQuerySchema.parse(req.query);
      const result = await getService().getTenantSessions(req.tenantId!, pagination);
      return reply.send(paginatedResponse(result.rows.map(toSessionResponse), result.total));
    },
  );
};
