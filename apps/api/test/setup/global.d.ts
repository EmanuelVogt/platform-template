import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import type { StartedTestContainer } from "testcontainers"

declare global {
  // Containers compartilhados entre globalSetup e globalTeardown (mesmo processo).
  var __pgContainer: StartedPostgreSqlContainer | undefined
  var __redisContainer: StartedTestContainer | undefined
}

export {}
