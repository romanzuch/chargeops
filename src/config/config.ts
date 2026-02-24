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
  /**
   * Refresh token lifetime in seconds. Default: 30 days (2592000 seconds).
   */
  jwtRefreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
  /**
   * Include refresh token in response body as fallback for non-browser clients.
   * Default: false (refresh token only in httpOnly cookie).
   */
  refreshTokenInBody: env.REFRESH_TOKEN_IN_BODY,
  /**
   * Whether to set Secure flag on refresh token cookie.
   * Auto-detected from NODE_ENV: true for production, false for development/test.
   */
  refreshTokenCookieSecure: env.NODE_ENV === "production",
} as const;
