import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { getDb } from "../db/kysely.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../http/errors.js";
import {
  UpdateUserRoleBodySchema,
  TenantUserResponseSchema,
} from "../http/schemas/tenant-users.schemas.js";
import { findUsersInTenant, updateUserTenantRole } from "../repositories/tenants.repo.js";
import type { TenantUserRow } from "../repositories/tenants.repo.js";

function toTenantUserResponse(row: TenantUserRow) {
  return TenantUserResponseSchema.parse({
    userId: row.userId,
    email: row.email,
    role: row.role,
    memberSince: row.memberSince.toISOString(),
  });
}

/**
 * Tenant user management endpoints.
 *
 * All routes require the `tenant_admin` role within the authenticated tenant.
 *
 * - GET  /tenant/users              — list users in the tenant with their roles
 * - PATCH /tenant/users/:userId/role — update a user's role (tenant_admin or tenant_view)
 *
 * Role transition rules:
 * - tenant_view  → tenant_admin  ✅
 * - tenant_admin → tenant_view   ✅ (demotion)
 * - tenant_view  → driver        ❌ (driver excluded from allowed enum)
 * - driver       → *             ❌ (out of scope; manage via super admin)
 * - self         → *             ❌ (guard: cannot change your own role)
 */
export const tenantUserRoutes: FastifyPluginAsync = async (app) => {
  const preHandler = [app.verifyJwt, app.verifyTenant, app.verifyRole(["tenant_admin"])];

  /**
   * GET /tenant/users
   *
   * Returns all members of the authenticated tenant with their roles,
   * ordered by join date ascending.
   *
   * Response (200): TenantUserResponse[]
   *
   * Errors:
   * - 401: missing or invalid token
   * - 403: requires tenant_admin role
   */
  app.get("/tenant/users", { preHandler }, async (req, reply) => {
    if (!req.tenantId) {
      throw new ForbiddenError("This endpoint requires a tenant context");
    }

    const users = await findUsersInTenant(getDb(), req.tenantId);
    return reply.send(users.map(toTenantUserResponse));
  });

  /**
   * PATCH /tenant/users/:userId/role
   *
   * Updates a user's role within the authenticated tenant.
   * Allowed target roles: tenant_admin, tenant_view.
   * The driver role cannot be assigned through this endpoint.
   * A tenant_admin cannot change their own role.
   *
   * Request: { role: "tenant_admin" | "tenant_view" }
   * Response (200): TenantUserResponse
   *
   * Errors:
   * - 400: invalid role value
   * - 401: missing or invalid token
   * - 403: requires tenant_admin role, or attempting to change own role
   * - 404: user not found in this tenant
   */
  app.patch("/tenant/users/:userId/role", { preHandler }, async (req, reply) => {
    if (!req.tenantId) {
      throw new ForbiddenError("This endpoint requires a tenant context");
    }

    const { userId } = req.params as { userId: string };

    if (req.jwtUser!.sub === userId) {
      throw new ForbiddenError("You cannot change your own role");
    }

    let body;
    try {
      body = UpdateUserRoleBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestError("Validation failed", JSON.stringify(err.flatten().fieldErrors));
      }
      throw err;
    }

    const updated = await updateUserTenantRole(getDb(), userId, req.tenantId, body.role);
    if (!updated) {
      throw new NotFoundError(`User not found in this tenant: ${userId}`);
    }

    // Re-fetch to get the user's email alongside the updated role
    const members = await findUsersInTenant(getDb(), req.tenantId);
    const member = members.find((m) => m.userId === userId);
    if (!member) {
      throw new NotFoundError(`User not found in this tenant: ${userId}`);
    }

    return reply.send(toTenantUserResponse(member));
  });
};
