import { ModulesContainer } from "@nestjs/core"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { cleanupOpenApiDoc } from "nestjs-zod"

import { IS_PUBLIC_KEY } from "../shared/kernel/access/decorators"

import type { INestApplication } from "@nestjs/common"
import type { OpenAPIObject } from "@nestjs/swagger"

// Subset estrutural do OperationObject — o tipo completo mora em deep path
// (dist/interfaces) que o exports map do @nestjs/swagger não expõe no NodeNext.
type OperationObject = {
  operationId?: string
  summary?: string
  security?: unknown[]
}

// Valor de DECORATORS.API_OPERATION do @nestjs/swagger (constants fora do
// exports map). Estável desde a v4; @ApiOperation grava aqui o operationId.
const API_OPERATION_METADATA = "swagger/apiOperation"

const DESCRIPTION = `API da plataforma.

## Autenticação
Sessão via cookie httpOnly (\`__Host-rit_session\`), emitido por \`POST /v1/auth/login\`. Enviar cookies em toda chamada autenticada (\`credentials: include\` no browser). Rotas públicas estão marcadas com \`security: []\` na operação.

## CSRF — exigido em toda mutação
Requests não-safe (POST/PATCH/PUT/DELETE) exigem header \`Origin\` (ou \`Referer\`) igual à origin do front oficial (\`WEB_ORIGIN\`); ausente ou divergente → 403. Browsers enviam \`Origin\` sozinhos; cliente não-browser precisa setar manualmente. Quando os cookies operam com \`SameSite=None\`, mutações autenticadas exigem também o header \`X-CSRF-Token\` com o valor do cookie \`rit_csrf\` (legível por JS, emitido no login).

## Idempotência
Endpoints marcados aceitam o header opcional \`Idempotency-Key\` (detalhe na própria operação): mesma chave + mesmo payload → replay da resposta original, sem repetir o efeito.

## Rate limit
Endpoints com limite devolvem 429 (RFC 7807) com header \`Retry-After\` em segundos.

## Erros
RFC 7807 (\`application/problem+json\`), sempre com \`correlationId\` pra rastreio.`

const MUTATING_METHODS = ["post", "put", "patch", "delete"] as const
const ALL_METHODS = ["get", "head", "options", ...MUTATING_METHODS] as const

function buildOpenApiConfig(): Omit<OpenAPIObject, "paths"> {
  return new DocumentBuilder()
    .setTitle("API")
    .setVersion("1")
    .setDescription(DESCRIPTION)
    .addCookieAuth("__Host-rit_session", {
      type: "apiKey",
      in: "cookie",
      name: "__Host-rit_session",
      description:
        "Cookie de sessão httpOnly emitido pelo login. Nome configurável via COOKIE_NAME (default __Host-rit_session).",
    })
    .addSecurityRequirements("cookie")
    .build()
}

/**
 * operationIds dos handlers @Public — mesma metadata que o AuthGuard lê, então
 * doc e runtime não dessincronizam. Depende de todo handler ter
 * @ApiOperation({ operationId }) (invariante já exigida pelo Kubb).
 */
function collectPublicOperationIds(app: INestApplication): Set<string> {
  const ids = new Set<string>()
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const metatype: unknown = wrapper.metatype
      if (typeof metatype !== "function") continue
      const proto = (metatype as { prototype?: object }).prototype
      if (!proto) continue
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = (proto as Record<string, unknown>)[name]
        if (name === "constructor" || typeof handler !== "function") continue
        const isPublic =
          (Reflect.getMetadata(IS_PUBLIC_KEY, handler) as unknown) === true ||
          (Reflect.getMetadata(IS_PUBLIC_KEY, metatype) as unknown) === true
        if (!isPublic) continue
        const op = Reflect.getMetadata(API_OPERATION_METADATA, handler) as
          | { operationId?: string }
          | undefined
        if (op?.operationId) ids.add(op.operationId)
      }
    }
  }
  return ids
}

/**
 * Documento OpenAPI único — consumido pelo /docs (main) e pelo export do
 * contrato (export-openapi). Mexer aqui propaga pros dois; não duplicar.
 *
 * Pós-processa o documento gerado pra refletir o que os guards globais exigem
 * em runtime e o Swagger não enxerga: security default por cookie com opt-out
 * das rotas @Public. CSRF fica na descrição do documento (prosa) e é refletido
 * pelo interceptor do api-client (rit_csrf → X-CSRF-Token), NÃO como parâmetro
 * por operação: param de header vira variable da mutation no Kubb e quebra
 * caller sem corpo (logout/revoke-others). Ver ADR 0015.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, buildOpenApiConfig())
  )
  const publicIds = collectPublicOperationIds(app)

  for (const pathItem of Object.values(document.paths)) {
    const item = pathItem as Record<string, OperationObject | undefined>
    for (const method of ALL_METHODS) {
      const op = item[method]
      if (!op) continue
      // @ApiOperation (usado só pra fixar operationId) injeta summary:"" — ruído.
      if (op.summary === "") {
        delete op.summary
      }
      if (op.operationId && publicIds.has(op.operationId)) {
        op.security = []
      }
    }
  }
  return document
}
