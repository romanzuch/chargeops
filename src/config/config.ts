import { parseEnv } from "./env.js";

const env = parseEnv(process.env);

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
} as const;
