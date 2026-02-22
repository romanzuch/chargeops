import Fastify, { type FastifyInstance } from "fastify";
import crypto from "crypto";

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

  return app;
}

export { buildApp };
