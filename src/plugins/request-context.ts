import fp from "fastify-plugin";
import crypto from "node:crypto";

/**
 * Adds request correlation (x-request-id) and basic request/response timing logs.
 *
 * Why a plugin?
 * - Keeps `buildApp()` small and focused.
 * - Reusable across apps (API, worker, admin, ...).
 * - Easy to unit-test / disable.
 *
 * Wrapped with fastify-plugin to disable encapsulation: hooks registered here
 * apply to all routes in the app, not just routes within this plugin's scope.
 */
export const requestContextPlugin = fp(async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    // Start timing as early as possible.
    request.startTime = process.hrtime.bigint();

    // Echo/propagate request id to the client.
    reply.header("x-request-id", request.id);

    request.log.info(
      {
        reqId: request.id,
        req: {
          method: request.method,
          url: request.url,
          host: request.headers.host,
          remoteAddress: request.ip,
        },
      },
      "incoming request",
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    const end = process.hrtime.bigint();
    const start = request.startTime ?? end;
    const responseTimeMs = Number(end - start) / 1_000_000;

    request.log.info(
      {
        reqId: request.id,
        res: { statusCode: reply.statusCode },
        responseTime: responseTimeMs,
      },
      "request completed",
    );
  });
}, { name: "request-context" });

/**
 * Centralized request id generator.
 *
 * Prefer honoring an existing header for trace propagation across services.
 */
export function genRequestId(headers: Record<string, unknown>): string {
  const header = headers["x-request-id"];
  if (typeof header === "string" && header.trim() !== "") return header;
  return `req-${crypto.randomUUID()}`;
}
