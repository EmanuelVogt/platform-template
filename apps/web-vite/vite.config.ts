import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { resolveDevPort } from "./scripts/dev-port.mjs"

export default defineConfig({
  plugins: [react()],
  server: {
    port: resolveDevPort(),
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
