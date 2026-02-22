import "dotenv/config";
import { buildApp } from "./app.js";
import { config } from "./config/config.js";

const app = buildApp();

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "failed to shutdown gracefully");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info({ port: config.port, env: config.env }, "server started");
  })
  .catch((err) => {
    app.log.error(err, "failed to start server");
    process.exit(1);
  });
