import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config/config.js";
import { verifyAccessToken } from "../services/jwt.service.js";
import { ForbiddenError, InternalServerError, UnauthorizedError } from "../http/errors.js";
import { getDb } from "../db/kysely.js";
import { findUserRoleInTenant } from "../repositories/users.repo.js";
import type { Role } from "../db/types.js";

/**
 * Registers the `verifyJwt`, `verifySuperAdmin`, and `verifyRole` preHandler
 * decorators, and the `jwtUser` / `userRole` request decorators.
 *
 * Wrapped with fastify-plugin so decorators escape encapsulation and are
 * available on every route in the application.
 *
 * Usage:
 * ```ts
 * // Any authenticated user:
 * app.get('/protected', { preHandler: [app.verifyJwt] }, handler)
 *
 * // Super admin only:
 * app.post('/admin/tenants', { preHandler: [app.verifySuperAdmin] }, handler)
 *
 * // Specific roles (must run after verifyJwt + verifyTenant):
 * app.post('/stations', { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(['tenant_admin'])] }, handler)
 * ```
 */
export const jwtAuthPlugin = fp(
  async (app) => {
    // Initialize per-request slot to null; populated by verifyJwt.
    app.decorateRequest("jwtUser", null);

    const verifyJwt = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      const secret = config.jwtSecret;
      if (!secret) {
        throw new InternalServerError("JWT_SECRET is not configured");
      }

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new UnauthorizedError("Missing or malformed Authorization header");
      }

      const token = authHeader.slice(7).trim();
      if (token === "") {
        throw new UnauthorizedError("Missing token");
      }

      request.jwtUser = await verifyAccessToken(token, secret);
    };

    const verifySuperAdmin = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> => {
      await verifyJwt(request, reply);
      if (!request.jwtUser?.isSuperAdmin) {
        throw new ForbiddenError("Super admin access required");
      }
    };

    /**
     * Returns a preHandler that checks the authenticated user has one of the
     * specified roles within their tenant. Must run after `verifyJwt` and
     * `verifyTenant`. Super admins bypass all role checks.
     *
     * On success, `request.userRole` is populated with the resolved role.
     */
    const verifyRole =
      (allowedRoles: Role[]) =>
      async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
        // Super admins are cross-tenant; role checks do not apply to them.
        if (request.jwtUser?.isSuperAdmin) return;

        const userId = request.jwtUser?.sub;
        const tenantId = request.tenantId;

        if (!userId || !tenantId) {
          throw new ForbiddenError("Role check requires authenticated tenant context");
        }

        const role = await findUserRoleInTenant(getDb(), userId, tenantId);

        if (!role || !allowedRoles.includes(role)) {
          throw new ForbiddenError(
            `Requires one of: ${allowedRoles.join(", ")}`,
          );
        }

        request.userRole = role;
      };

    app.decorateRequest("userRole", null);
    app.decorate("verifyJwt", verifyJwt);
    app.decorate("verifySuperAdmin", verifySuperAdmin);
    app.decorate("verifyRole", verifyRole);
  },
  { name: "jwt-auth" },
);
