import "fastify";
import type { AccessTokenPayload } from "../services/jwt.service.js";
import type { Role } from "../db/types.js";

declare module "fastify" {
  interface FastifyRequest {
    startTime?: bigint;
    /**
     * Populated by `verifyJwt` preHandler after successful token verification.
     * null on all requests that have not passed through `verifyJwt`.
     */
    jwtUser: AccessTokenPayload | null;
    /**
     * Populated by `verifyTenant` preHandler after tenant context is resolved.
     * Equals the `tid` claim from the JWT (validated against `x-tenant-id`
     * header if present). null for super admins (cross-tenant) and on requests
     * that have not passed through `verifyTenant`.
     */
    tenantId: string | null;
    /**
     * Populated by `verifyRole` preHandler after role is confirmed.
     * null for super admins (who bypass role checks) and on requests
     * that have not passed through `verifyRole`.
     */
    userRole: Role | null;
  }

  interface FastifyInstance {
    /**
     * Use as a preHandler on routes that require a valid access token.
     *
     * @example
     * app.get('/protected', { preHandler: [app.verifyJwt] }, handler)
     */
    verifyJwt: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Use after `verifyJwt` on routes that require tenant context.
     * Validates the optional `x-tenant-id` request header against the JWT `tid`
     * claim and populates `request.tenantId`. Super admins bypass this check.
     *
     * @example
     * app.get('/protected', { preHandler: [app.verifyJwt, app.verifyTenant] }, handler)
     */
    verifyTenant: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Use as a preHandler on routes that require super admin access.
     * Combines JWT verification with a super admin check.
     *
     * @example
     * app.post('/admin/tenants', { preHandler: [app.verifySuperAdmin] }, handler)
     */
    verifySuperAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Returns a preHandler that enforces role-based access control.
     * Must be used after `verifyJwt` and `verifyTenant`. Super admins bypass
     * the check. On success, `request.userRole` is populated.
     *
     * @example
     * // tenant_admin only:
     * app.post('/stations', { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(['tenant_admin'])] }, handler)
     *
     * // all tenant roles (tenant_admin, tenant_view, driver):
     * app.get('/tenant/stations', { preHandler: [app.verifyJwt, app.verifyTenant, app.verifyRole(['tenant_admin', 'tenant_view', 'driver'])] }, handler)
     */
    verifyRole: (allowedRoles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
