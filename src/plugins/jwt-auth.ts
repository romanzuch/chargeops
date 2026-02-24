import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config/config.js";
import { verifyAccessToken } from "../services/jwt.service.js";
import { InternalServerError, UnauthorizedError } from "../http/errors.js";

/**
 * Registers the `verifyJwt` preHandler decorator and the `jwtUser` request
 * decorator.
 *
 * Wrapped with fastify-plugin so decorators escape encapsulation and are
 * available on every route in the application.
 *
 * Usage:
 * ```ts
 * app.get('/protected', { preHandler: [app.verifyJwt] }, async (req) => {
 *   return { userId: req.jwtUser!.sub };
 * });
 * ```
 */
export const jwtAuthPlugin = fp(
  async (app) => {
    // Initialize per-request slot to null; populated by verifyJwt.
    app.decorateRequest("jwtUser", null);

    const verifyJwt = async (
      request: FastifyRequest,
      _reply: FastifyReply,
    ): Promise<void> => {
      const secret = config.jwtSecret;
      if (!secret) {
        throw new InternalServerError("JWT_SECRET is not configured");
      }

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new UnauthorizedError(
          "Missing or malformed Authorization header",
        );
      }

      const token = authHeader.slice(7).trim();
      if (token === "") {
        throw new UnauthorizedError("Missing token");
      }

      request.jwtUser = await verifyAccessToken(token, secret);
    };

    app.decorate("verifyJwt", verifyJwt);
  },
  { name: "jwt-auth" },
);
