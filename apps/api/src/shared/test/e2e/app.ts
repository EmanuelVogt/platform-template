import { VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll } from "vitest"

import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../kernel/context/request-context"
import { createRequestContextMiddleware } from "../../kernel/context/request-context.middleware"
import { RATE_LIMITER } from "../../kernel/rate-limit/rate-limiter.port"
import { createTestPool } from "../int/db"

import type { ApplicationPool } from "../../infra/database/application-pool"
import type { RateLimiter } from "../../kernel/rate-limit/rate-limiter.port"
import type { INestApplication, InjectionToken, Type } from "@nestjs/common"
import type { TestingModuleBuilder } from "@nestjs/testing"

/** Limiter que nunca bloqueia — para e2e que precisam de sessão, não de limite. */
export const allowAllRateLimiter: RateLimiter = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
  reset: () => Promise.resolve(),
}

export type CreateE2eAppOptions = {
  rateLimiter?: "allow-all" | "real"
  overrides?: [InjectionToken, unknown][]
  extraModules?: Type<unknown>[]
  middleware?: "full" | "none"
  // SPEC_DEVIATION: `configure` e `beforeInit` são opções além do saco descrito
  // no design (§ Components 3).
  // Reason: sem elas a fábrica não cobre os e2e que já existem — `configure`
  // para um override que não é `useValue` (é o que as entradas passam hoje) e
  // `beforeInit` para registrar rota crua antes do `app.init()`, que é a única
  // janela em que o router do Nest ainda a enxerga (security-bootstrap). Sem as
  // duas, `Test.createTestingModule` volta a aparecer em mais de um arquivo, que
  // é o critério de aceite.
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder
  beforeInit?: (app: INestApplication) => void
}

export type E2eApp = {
  app: INestApplication
  http: ReturnType<typeof request>
  close: () => Promise<void>
}

/**
 * Único bootstrap de app e2e do repositório. Em `middleware: "full"` espelha o
 * `main.ts` (versionamento URI, `applySecurity`, RequestContext); em `"none"`
 * sobe o app cru, ainda silencioso e ainda fechável.
 */
export async function createE2eApp(
  opts: CreateE2eAppOptions = {}
): Promise<E2eApp> {
  const base = Test.createTestingModule({
    imports: [AppModule, ...(opts.extraModules ?? [])],
  })
  if ((opts.rateLimiter ?? "allow-all") === "allow-all") {
    base.overrideProvider(RATE_LIMITER).useValue(allowAllRateLimiter)
  }
  for (const [token, value] of opts.overrides ?? []) {
    base.overrideProvider(token).useValue(value)
  }
  const moduleRef = await (
    opts.configure ? opts.configure(base) : base
  ).compile()
  const app = moduleRef.createNestApplication({ logger: false })
  if ((opts.middleware ?? "full") === "full") {
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
  }
  opts.beforeInit?.(app)
  await app.init()
  const server = app.getHttpServer() as Parameters<typeof request>[0]
  return {
    app,
    http: request(server),
    close: () => app.close(),
  }
}

/**
 * Pool da suíte, aberto no `beforeAll` e fechado no `afterAll`. Existe para que
 * nenhum `it` abra o seu — um pool por teste vaza conexão quando o teste falha.
 */
export function withE2ePool(): { readonly pool: ApplicationPool } {
  let pool: ApplicationPool | null = null

  beforeAll(() => {
    pool = createTestPool()
  })

  afterAll(async () => {
    if (pool !== null) await pool.end()
    pool = null
  })

  return {
    get pool() {
      if (pool === null) {
        throw new Error(
          "withE2ePool: o pool só existe dentro de beforeEach/it — leia o handle lá, não no corpo do describe"
        )
      }
      return pool
    },
  }
}
