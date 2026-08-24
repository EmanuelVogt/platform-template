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
    name: "web",
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // Default de 5s estoura em teste RTL pesado quando a suíte inteira roda com
    // coverage e disputa CPU; o mesmo teste leva <1s isolado.
    testTimeout: 15_000,
    // env validada no boot (shared/config/env) exige VITE_API_URL; provê no teste.
    env: { VITE_API_URL: "http://localhost:3000" },
  },
})
