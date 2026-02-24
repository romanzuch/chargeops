import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /**
   * PostgreSQL connection string.
   * Example: postgresql://user:pass@localhost:5432/chargeops
   */
  DATABASE_URL: z.string().min(1).optional(),
  /**
   * Optional pino log level.
   * @see https://getpino.io/#/docs/api?id=level-string
   */
  LOG_LEVEL: z.string().optional(),
  /**
   * HMAC secret for signing JWTs (HS256).
   * Minimum 32 characters (256 bits) required by NIST for HMAC-SHA256.
   */
  JWT_SECRET: z.string().min(32).optional(),
  /**
   * Access token lifetime in seconds. Default: 900 (15 minutes).
   */
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /**
   * Refresh token lifetime in seconds. Default: 2592000 (30 days).
   */
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  /**
   * Include refresh token in response body as fallback for non-browser clients.
   * Default: false (refresh token only in httpOnly cookie).
   */
  REFRESH_TOKEN_IN_BODY: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default(false),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment variables: ${JSON.stringify(formatted)}`);
  }
  return parsed.data;
}
