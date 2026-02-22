import type { FastifyError, FastifyPluginAsync } from "fastify";
import { AppError } from "../http/errors.js";
import { problem } from "../http/problem-details.js";

/**
 * Centralized error handling using RFC 9457 Problem Details.
 *
 * Why a plugin?
 * - Keeps app bootstrap small.
 * - Ensures consistent error responses across routes.
 */
export const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  // 404 - Not Found
  app.setNotFoundHandler(async (request, reply) => {
    const payload = problem({
      type: "https://errors.chargeops.dev/not-found",
      title: "Not Found",
      status: 404,
      detail: "Route not found",
      instance: request.url,
      traceId: request.id,
    });

    return reply.code(404).type("application/problem+json").send(payload);
  });

  // Global error handler
  app.setErrorHandler(async (err: FastifyError | Error, request, reply) => {
    // Fastify/AJV validation errors typically include statusCode and validation details.
    const anyErr = err as any;

    // Domain/use-case errors
    if (err instanceof AppError) {
      const payload = problem({
        type: err.type,
        title: err.title,
        status: err.statusCode,
        detail: err.detail,
        instance: request.url,
        traceId: request.id,
      });

      request.log.warn({ reqId: request.id, err }, "handled app error");
      return reply.code(err.statusCode).type("application/problem+json").send(payload);
    }

    // Validation errors
    if (typeof anyErr.statusCode === "number" && anyErr.statusCode === 400 && anyErr.validation) {
      const payload = problem({
        type: "https://errors.chargeops.dev/validation",
        title: "Validation Error",
        status: 400,
        detail: "Request validation failed",
        instance: request.url,
        traceId: request.id,
        errors: { body: ["Invalid request payload"] },
      });

      request.log.info({ reqId: request.id, err }, "validation error");
      return reply.code(400).type("application/problem+json").send(payload);
    }

    // Default fallback
    const status = typeof anyErr.statusCode === "number" ? anyErr.statusCode : 500;

    const payload = problem({
      type: "https://errors.chargeops.dev/internal",
      title: status === 500 ? "Internal Server Error" : "Error",
      status,
      detail: status === 500 ? "Unexpected error" : (err.message || "Error"),
      instance: request.url,
      traceId: request.id,
    });

    request.log.error({ reqId: request.id, err }, "unhandled error");
    return reply.code(status).type("application/problem+json").send(payload);
  });
};
