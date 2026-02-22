import type { FastifyPluginAsync } from "fastify";

/**
 * Health endpoints.
 *
 * Keep this minimal and dependency-free so it stays reliable even if downstream
 * services (DB, external APIs) are unhealthy.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return { status: "ok" } as const;
  });
};
