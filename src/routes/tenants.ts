import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../db/kysely.js";
import { findAllTenants } from "../repositories/tenants.repo.js";
import { PaginationQuerySchema, paginatedResponse } from "../http/schemas/pagination.schemas.js";

/**
 * Public tenant routes — no authentication required.
 *
 * Used by clients to show the tenant list on the registration form.
 */
export const tenantRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /tenants
   *
   * List all tenants (id + name only), paginated.
   *
   * Query params: limit (default 20), offset (default 0)
   * Response (200): { data: Array<{ id, name }>, total: number }
   */
  app.get("/tenants", async (req) => {
    const pagination = PaginationQuerySchema.parse(req.query);
    const result = await findAllTenants(getDb(), pagination);
    return paginatedResponse(result.rows.map((t) => ({ id: t.id, name: t.name })), result.total);
  });
};
