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
  }

  interface FastifyInstance {
    /**
     * Use as a preHandler on routes that require a valid access token.
     *
     * @example
     * app.get('/protected', { preHandler: [app.verifyJwt] }, handler)
     */
    verifyJwt: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
