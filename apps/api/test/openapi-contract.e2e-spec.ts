import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"

import { AppModule } from "../src/app.module"
import { buildOpenApiDocument } from "../src/openapi/openapi-config"

type OpenApiDoc = {
  paths: Record<string, Record<string, unknown>>
  components?: { schemas?: Record<string, unknown> }
}

function loadDoc(): OpenApiDoc {
  // openapi.json vive na raiz do monorepo; o teste roda de apps/api/test.
  const path = resolve(__dirname, "../../../openapi.json")
  return JSON.parse(readFileSync(path, "utf8")) as OpenApiDoc
}

describe("contrato OpenAPI — rotas de auth", () => {
  it("mantém o conjunto de paths /auth com seus métodos", () => {
    const doc = loadDoc()
    const authShape = Object.entries(doc.paths)
      .filter(([p]) => p.includes("/auth"))
      .map(([p, methods]) => [p, Object.keys(methods).sort()] as const)
      .sort(([a], [b]) => a.localeCompare(b))
    expect(authShape).toMatchSnapshot()
  })

  it("mantém os schemas de DTO de auth", () => {
    const doc = loadDoc()
    const schemaNames = Object.keys(doc.components?.schemas ?? {})
      .filter((n) =>
        /Register|Login|ForgotPassword|ResetPassword|ChangePassword|VerifyEmail|CurrentUserResponse|DeviceListResponse/.test(
          n,
        ),
      )
      .sort()
    expect(schemaNames).toMatchSnapshot()
  })

  it("não vaza passwordHash nem tokenHash nas respostas", () => {
    const doc = loadDoc()
    const serialized = JSON.stringify(doc.components?.schemas ?? {})
    expect(serialized).not.toContain("passwordHash")
    expect(serialized).not.toContain("tokenHash")
  })

  it("não expõe header de transporte como parâmetro de operação", () => {
    // Origin/X-CSRF-Token/Correlation são responsabilidade do transporte do
    // api-client (interceptor), não param: o Kubb costura header param na
    // `variables` da mutation e quebra caller sem corpo (logout). Idempotency-Key
    // é exceção consciente (input do caller). Ver ADR 0023.
    const doc = loadDoc()
    const TRANSPORT_HEADERS = ["origin", "x-csrf-token", "x-correlation-id"]
    const offenders: string[] = []
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const params = (op as { parameters?: { name?: string; in?: string }[] })
          .parameters
        if (!Array.isArray(params)) continue
        for (const p of params) {
          if (
            p.in === "header" &&
            typeof p.name === "string" &&
            TRANSPORT_HEADERS.includes(p.name.toLowerCase())
          ) {
            offenders.push(`${method.toUpperCase()} ${path} → ${p.name}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe("contrato OpenAPI — drift código vs arquivo commitado", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = moduleRef.createNestApplication({ logger: false })
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("documento gerado pelo código é idêntico ao openapi.json commitado", () => {
    // Divergiu = contrato mudou sem rodar `pnpm contract` (e sem regenerar o
    // client). O roundtrip por JSON normaliza `undefined` igual ao export.
    const generated = JSON.parse(
      JSON.stringify(buildOpenApiDocument(app)),
    ) as OpenApiDoc
    expect(generated).toEqual(loadDoc())
  })
})
