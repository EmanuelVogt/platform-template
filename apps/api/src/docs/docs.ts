import { apiReference } from "@scalar/nestjs-api-reference"

import type { INestApplication } from "@nestjs/common"
import type { OpenAPIObject } from "@nestjs/swagger"
import type { Express, RequestHandler } from "express"

const DOCS_PATH = "/docs"

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
 */
export function mountDocs(
  app: INestApplication,
  document: OpenAPIObject
): void {
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
