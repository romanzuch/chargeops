import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import crypto from "crypto";
import { problem } from "./http/problem-details.js";
import { AppError } from "./http/errors.js";

function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
    genReqId: (req) => {
      const header = req.headers["x-request-id"];
      if (typeof header === "string" && header.trim() !== "") return header;
      return `req-${crypto.randomUUID()}`;
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    // start timing
    request.startTime = process.hrtime.bigint();

    // echo req id to client
    reply.header("x-request-id", request.id);

    // structured incoming log
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

  app.get("/health", async () => {
    return { status: "ok" };
  });

  // ERROR 404 NOT FOUND HANDLER
  app.setNotFoundHandler(async (request, reply) => {
    const payload = problem({
      type: "https://errors.chargeops.dev/not-found",
      title: "Not Found",
      status: 404,
      detail: "Route not found",
      instance: request.url,
      traceId: request.id,
    });
    reply.code(404).type("application/problem+json").send(payload);
  });

  // GLOBAL ERROR HANDLER
  app.setErrorHandler(async (err: FastifyError | Error, request, reply) => {
    // Fastify validation errors (AJV) usually have statusCode = 400 and validation info
    const anyErr = err as any;

    // App errors (domain/use-case)
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

    // Validation errors (Fastify/AJV)
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

  return app;
}

export { buildApp };
