import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";
const env = loadEnv("", process.cwd(), ["GROQ_", "AI_"]);
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", env, include: ["evaluation/live.test.ts"], maxWorkers: 1 },
});
