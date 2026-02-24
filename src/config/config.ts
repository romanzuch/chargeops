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
  /**
   * Optional: only required when the JWT auth plugin is in use.
   * The plugin will throw InternalServerError at request time if unset.
   */
  jwtSecret: env.JWT_SECRET,
  jwtAccessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
} as const;
