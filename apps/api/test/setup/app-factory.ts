import { VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"

import { AppModule } from "../../src/app.module"
import { applySecurity } from "../../src/main"
import { RequestContext } from "../../src/shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../src/shared/kernel/context/request-context.middleware"

import type { RateLimiter } from "../../src/modules/identity/domain/ports/rate-limiter"
import type { INestApplication } from "@nestjs/common"
import type { TestingModuleBuilder } from "@nestjs/testing"

/** Rate-limiter que libera tudo — para e2e que não exercitam o limite. */
export const allowAllRateLimiter: RateLimiter = {
  consume: async () => ({ allowed: true, retryAfterSeconds: 0 }),
}

/**
 * Sobe o AppModule como app e2e com o mesmo bootstrap do main (versionamento
 * URI, security, middleware de RequestContext). `configure` recebe o builder
 * antes do compile para aplicar overrides (RATE_LIMITER, MAILER, OBJECT_STORAGE).
 * Centraliza o bootstrap que estava duplicado em cada e2e.
 */
export async function createE2eApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  const base = Test.createTestingModule({ imports: [AppModule] })
  const builder = configure ? configure(base) : base
  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication()
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
  applySecurity(app)
  app.use(createRequestContextMiddleware(app.get(RequestContext)))
  await app.init()
  return app
}
