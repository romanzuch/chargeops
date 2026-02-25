import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../db/kysely.js";
import { findAllTenants } from "../repositories/tenants.repo.js";

/**
 * Public tenant routes — no authentication required.
 *
 * Used by clients to show the tenant list on the registration form.
 */
export const tenantRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /tenants
   *
   * List all tenants (id + name only).
   *
   * Response (200): Array of { id, name }
   */
  app.get("/tenants", async () => {
    const tenants = await findAllTenants(getDb());
    return tenants.map((t) => ({ id: t.id, name: t.name }));
  });
};
