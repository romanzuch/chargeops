import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ForbiddenError, UnauthorizedError } from "../http/errors.js";

const X_TENANT_ID_HEADER = "x-tenant-id";

/**
 * Registers the `verifyTenant` preHandler decorator and the `tenantId` request
 * decorator.
 *
 * Must be used after `verifyJwt` in the preHandler chain — it reads
 * `request.jwtUser` which is populated by that plugin.
 *
 * Behaviour:
 * - If `x-tenant-id` header is present it must match the `tid` claim in the
 *   JWT, otherwise 403 Forbidden is returned.
 * - If the header is absent the `tid` claim is used directly.
 * - `request.tenantId` is set to the resolved tenant ID.
 * - The request logger is enriched with `{ tenantId }` so all subsequent log
 *   calls (including the response log from request-context plugin) carry it.
 *
 * Public routes (health, auth/*) do not include this preHandler and are
 * therefore unaffected.
 *
 * Usage:
 * ```ts
 * app.get('/protected', { preHandler: [app.verifyJwt, app.verifyTenant] }, async (req) => {
 *   return { tenantId: req.tenantId! };
 * });
 * ```
 */
export const tenantContextPlugin = fp(
  async (app) => {
    // Initialize per-request slot to null; populated by verifyTenant.
    app.decorateRequest("tenantId", null);

    const verifyTenant = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      if (!request.jwtUser) {
        // verifyJwt was not in the preHandler chain before verifyTenant.
        throw new UnauthorizedError("Authentication required");
      }

      const tokenTid = request.jwtUser.tid;
      const headerTid = request.headers[X_TENANT_ID_HEADER];

      if (headerTid !== undefined && headerTid !== tokenTid) {
        throw new ForbiddenError("x-tenant-id header does not match token tenant");
      }

      request.tenantId = tokenTid;

      // Enrich the child logger so all subsequent log calls for this request
      // automatically include tenantId (satisfies DoD: "Logs enthalten tenantId").
      request.log = request.log.child({ tenantId: tokenTid });
    };

    app.decorate("verifyTenant", verifyTenant);
  },
  { name: "tenant-context" },
);
