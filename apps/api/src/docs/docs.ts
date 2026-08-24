import type { Env } from "../shared/config/env"
import type { INestApplication } from "@nestjs/common"
import type { OpenAPIObject } from "@nestjs/swagger"
import type { Express, RequestHandler } from "express"

const DOCS_PATH = "/docs"

/**
 * Predicado puro: `/docs` não pode ser exercitado sob Jest (Scalar é ESM), então
 * a regra de gate mora aqui, testável sem boot do Nest.
 */
export function shouldMountDocs(
  env: Pick<Env, "NODE_ENV" | "DOCS_ENABLED">
): boolean {
  return !(env.NODE_ENV === "production" && !env.DOCS_ENABLED)
}

/**
 * CSP da UI do Scalar: runtime e estilos servidos pelo jsdelivr (tema
 * default) — o kernel não carrega CSS de marca, isso é recipe de entrada.
 */
const DOCS_UI_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
  "font-src 'self' data: https://cdn.jsdelivr.net; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self' https://cdn.jsdelivr.net; " +
  "worker-src 'self' blob:"

/**
 * Monta a UI do Scalar em `/docs` sobre o contrato OpenAPI do kernel — sem
 * gate de login, sem sessão, sem cookie: o kernel não conhece identidade.
 * Uma entrada que precise restringir acesso implementa o próprio gate (fora
 * daqui, na sua camada de guards).
 *
 * Import dinâmico: `@scalar/nestjs-api-reference` é ESM puro. Estático, ele
 * quebraria qualquer import de `docs.ts` sob Jest (CJS) — inclusive o de
 * `shouldMountDocs`, que precisa rodar sem boot do Nest.
 */
export async function mountDocs(
  app: INestApplication,
  document: OpenAPIObject
): Promise<void> {
  const { apiReference } = await import("@scalar/nestjs-api-reference")
  const server = app.getHttpAdapter().getInstance() as unknown as Express
  server.use(DOCS_PATH, (_req, res, next) => {
    res.setHeader("Content-Security-Policy", DOCS_UI_CSP)
    next()
  })
  server.use(
    DOCS_PATH,
    apiReference({ content: document }) as unknown as RequestHandler
  )
}
