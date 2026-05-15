import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/vitest-setup-env.ts"],
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    /** Avoid thread-pool RPC timeouts on long DB-heavy suites (see Vitest birpc `onTaskUpdate`). */
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
