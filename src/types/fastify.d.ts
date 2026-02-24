import "fastify";
import type { AccessTokenPayload } from "../services/jwt.service.js";

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
     * header if present). null on requests that have not passed through
     * `verifyTenant`.
     */
    tenantId: string | null;
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
     * claim and populates `request.tenantId`.
     *
     * @example
     * app.get('/protected', { preHandler: [app.verifyJwt, app.verifyTenant] }, handler)
     */
    verifyTenant: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
