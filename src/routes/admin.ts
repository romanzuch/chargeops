import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ZodError } from "zod";
import { BadRequestError } from "../http/errors.js";
import { getDb } from "../db/kysely.js";
import { createTenant, findAllTenants } from "../repositories/tenants.repo.js";

const CreateTenantBodySchema = z.object({
  name: z.string().min(1, "name is required").max(255),
});

/**
 * Admin routes — accessible to super admins only.
 *
 * All routes are protected with `app.verifySuperAdmin`.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /admin/tenants
   *
   * List all tenants.
   *
   * Response (200): Array of { id, name, createdAt }
   */
  app.get("/admin/tenants", { preHandler: [app.verifySuperAdmin] }, async () => {
    const tenants = await findAllTenants(getDb());
    return tenants.map((t) => ({ id: t.id, name: t.name, createdAt: t.created_at }));
  });

  /**
   * POST /admin/tenants
   *
   * Create a new tenant.
   *
   * Request: { name }
   * Response (201): { id, name, createdAt }
   *
   * Errors:
   * - 400: validation failure
   * - 403: not a super admin
   */
  app.post("/admin/tenants", { preHandler: [app.verifySuperAdmin] }, async (req, reply) => {
    let validated;
    try {
      validated = CreateTenantBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.flatten().fieldErrors;
        throw new BadRequestError("Validation failed", JSON.stringify(errors));
      }
      throw err;
    }

    const tenant = await createTenant(getDb(), { name: validated.name });
    return reply
      .status(201)
      .send({ id: tenant.id, name: tenant.name, createdAt: tenant.created_at });
  });
};
