import "./tracing.bootstrap"

import { type INestApplication, VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import cookieParser from "cookie-parser"
import helmet from "helmet"

import { AppModule } from "./app.module"
import { bootstrapProduct } from "./bootstrap.product"
import { mountDocs, shouldMountDocs } from "./docs/docs"
import { buildOpenApiDocument } from "./openapi/openapi-config"
import { env } from "./shared/config/env"
import { RequestContext } from "./shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "./shared/kernel/context/request-context.middleware"
import { LoggerFactory } from "./shared/kernel/logging/logger.factory"

/** Aplica CORS restrito, cookies, helmet e trust proxy. Reusado no e2e. */
export function applySecurity(app: INestApplication): void {
  const config = env()
  app.use(cookieParser())
  app.use(helmet())
  // Array (não string): cors reflete a origin só quando casa e omite o header
  // nas demais. Com string, o ACAO seria emitido sempre.
  app.enableCors({ origin: [config.WEB_ORIGIN], credentials: true })
  const http = app.getHttpAdapter().getInstance() as {
    set?: (key: string, value: unknown) => void
  }
  http.set?.("trust proxy", config.TRUST_PROXY_HOPS)
}

/**
 * Monta o app até o ponto anterior a `listen` — inclui o seam do produto.
 * Exportado para o e2e reconstruir o mesmo boot sem abrir porta real.
 */
export async function createApp(): Promise<INestApplication> {
  // Sem os níveis informativos do logger embutido: o mapa de rotas dele são 480
  // linhas por boot, com escapes ANSI crus, que só encurtam a retenção do log do
  // container. Falha de bootstrap sai em `error`/`warn` e continua visível; o
  // que a aplicação tem a dizer sai pelo LoggerFactory, em JSON.
  // rawBody: true preserva o corpo cru no request — produtos que verificam
  // assinatura de webhook (ex.: gateway de pagamento) precisam dele intacto,
  // antes do parse do body-parser.
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
    rawBody: true,
  })

  app.enableShutdownHooks()
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
  applySecurity(app)

  // Upload de anexo grande em conexão doméstica passa dos 5 min padrão do Node
  // e seria cortado no meio do envio. headersTimeout fica no padrão do Node
  // (min(requestTimeout, 60s)): cobre só a fase de cabeçalhos, antes de
  // qualquer autenticação, e não tem relação com upload longo — afrouxá-lo
  // junto seria segurar socket sem necessidade.
  const server = app.getHttpServer() as {
    requestTimeout: number
  }
  server.requestTimeout = 30 * 60 * 1000

  // Popula o RequestContext (ALS) antes de qualquer handler.
  app.use(createRequestContextMiddleware(app.get(RequestContext)))

  if (shouldMountDocs(env())) {
    await mountDocs(app, buildOpenApiDocument(app))
  }

  // Seam do produto: depois de mountDocs, antes de listen (bootstrap.product.ts).
  await bootstrapProduct(app)

  return app
}

async function bootstrap(): Promise<void> {
  const app = await createApp()

  // O flush dos spans OTel no shutdown roda via TracingModule
  // (onApplicationShutdown), disparado pelo enableShutdownHooks em SIGTERM/SIGINT.
  const port = env().PORT
  await app.listen(port)

  const logger = app.get(LoggerFactory).forModule("bootstrap")
  logger.info(`Servidor no ar em http://localhost:${port}`)
  logger.info(`Docs disponíveis em http://localhost:${port}/docs`)
}

// Só boota quando executado direto (node dist/main); importar para reuso
// (applySecurity no e2e) não dispara o servidor.
if (require.main === module) {
  void bootstrap()
}
