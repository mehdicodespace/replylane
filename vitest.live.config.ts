import { defineConfig } from "vitest/config";
import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";
loadEnvConfig(process.cwd());
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["evaluation/live.test.ts"], maxWorkers: 1 },
});
