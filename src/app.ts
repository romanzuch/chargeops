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
    reply.header("x-request-id", request.id);
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}

export { buildApp };
