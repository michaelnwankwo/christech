import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests run on the Node runtime; every tested module is framework-free
// (pure functions, zustand vanilla stores). React components are covered by
// the build/typecheck gate plus the manual E2E script in the README.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
