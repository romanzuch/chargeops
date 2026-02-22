import { parseEnv } from "./env.js";

const env = parseEnv(process.env);

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  /**
   * Optional because not every process needs DB access (e.g. pure HTTP health checks).
   * `getDb()` will throw a clear error if DB access is attempted without this.
   */
  databaseUrl: env.DATABASE_URL,
  logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
} as const;
