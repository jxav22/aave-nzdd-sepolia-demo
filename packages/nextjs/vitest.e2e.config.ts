import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Live Sepolia write e2e. Opt-in via AAVE_E2E=1 + E2E_PRIVATE_KEY.
 * Run: yarn aave:e2e
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.e2e.test.ts"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["e2e/setupE2eEnv.ts"],
    testTimeout: 420_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      "~~": path.resolve(__dirname, "./"),
    },
  },
});
