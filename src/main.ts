import "dotenv/config";
import { buildApp } from "./app.js";
const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";
const app = buildApp();

app
  .listen({ port, host })
  .then(() => {
    app.log.info({ port }, "server started");
  })
  .catch((err) => {
    app.log.error(err, "failed to start server");
    process.exit(1);
  });
