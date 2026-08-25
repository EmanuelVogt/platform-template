import { createE2eApp as createHarnessApp } from "../../src/shared/test/e2e/app"

import type { INestApplication, Type } from "@nestjs/common"
import type { TestingModuleBuilder } from "@nestjs/testing"

/**
 * Plumbing legado: ver `test-logger.ts`. Delega no harness — `rateLimiter:
 * "real"` porque a fábrica antiga não trocava o limiter, e um e2e de rate-limit
 * que passasse a receber o allow-all deixaria de medir o que mede.
 */
export async function createE2eApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
  extraModules?: Type<unknown>[]
): Promise<INestApplication> {
  const { app } = await createHarnessApp({
    rateLimiter: "real",
    ...(configure ? { configure } : {}),
    ...(extraModules ? { extraModules } : {}),
  })
  return app
}
