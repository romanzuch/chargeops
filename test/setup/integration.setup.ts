import { beforeAll } from "vitest";
import { execa } from "execa";

beforeAll(async () => {
  await execa("npx", ["tsx", "test/db-reset-and-migrate.ts"], {
    stdio: "inherit",
    env: { ...process.env },
  });
});
