import path from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // Default de 5s estoura em teste RTL pesado quando a suíte inteira roda com
    // coverage e disputa CPU; o mesmo teste leva <1s isolado.
    testTimeout: 15_000,
    // env validada no boot (shared/config/env) exige VITE_API_URL; provê no teste.
    env: { VITE_API_URL: "http://localhost:3000" },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/shared/test/**",
      ],
      // Ratchet: não baixar para passar no gate — subir só com teste novo.
      thresholds: {
        statements: 64,
        branches: 56,
        functions: 61,
        lines: 64,
      },
    },
  },
})
