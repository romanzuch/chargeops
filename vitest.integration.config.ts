import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["test/setup/integration.setup.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
