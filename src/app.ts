import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config/config.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { jwtAuthPlugin } from "./plugins/jwt-auth.js";
import { tenantContextPlugin } from "./plugins/tenant-context.js";
import { genRequestId, requestContextPlugin } from "./plugins/request-context.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { stationRoutes } from "./routes/stations.js";
import { tenantRoutes } from "./routes/tenants.js";
import { tenantUserRoutes } from "./routes/tenant-users.js";

/**
 * Builds the Fastify application.
 *
 * Design goals:
 * - Keep bootstrap minimal (register plugins/routes, return app).
 * - Keep cross-cutting concerns (logging, error handling) in plugins.
 * - Make it easy to instantiate the app in tests via `buildApp()`.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Add basic redaction early to avoid accidentally logging secrets.
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", 'req.headers["set-cookie"]'],
        remove: true,
      },
    },
    genReqId: (req) => genRequestId(req.headers as Record<string, unknown>),
  });

  // CORS — must be registered before routes
  if (config.corsOrigins.length > 0) {
    app.register(fastifyCors, {
      origin: config.corsOrigins,
      credentials: true, // needed for HttpOnly cookie-based refresh tokens
      exposedHeaders: ["x-request-id"],
    });
  }

  // Rate limiting — registered globally; per-route limits override via config.rateLimit
  app.register(fastifyRateLimit, {
    global: false, // opt-in per route, not global blanket limit
    keyGenerator: (req) => req.ip,
  });

  // OpenAPI docs
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "ChargeOps API",
        description: "Multi-tenant EV charging station management API",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });
  app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  // Cross-cutting concerns
  app.register(fastifyCookie);
  app.register(requestContextPlugin);
  app.register(errorHandlerPlugin);
  app.register(jwtAuthPlugin);
  app.register(tenantContextPlugin);

  // Routes
  app.register(authRoutes);
  app.register(healthRoutes);
  app.register(stationRoutes);
  app.register(adminRoutes);
  app.register(tenantRoutes);
  app.register(tenantUserRoutes);

  return app;
}
