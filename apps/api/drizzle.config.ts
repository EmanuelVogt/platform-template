import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://devuser:devpassword@localhost:5432/devdb",
  },
  verbose: true,
  strict: true,
})
