import "dotenv/config";
import { buildApp } from "./app.js";
import { config } from "./config/config.js";

const app = buildApp();

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info({ port: config.port, env: config.env }, "server started");
  })
  .catch((err) => {
    app.log.error(err, "failed to start server");
    process.exit(1);
  });
