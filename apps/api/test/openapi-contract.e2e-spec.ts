import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

type OpenApiDocument = {
  paths: Record<string, Record<string, { operationId?: string }>>
}

// O contrato em si (o mesmo documento que `/docs` serve em produção) é o que
// este arquivo valida, lendo o openapi.json exportado na raiz.
describe("contrato OpenAPI do kernel", () => {
  it("expõe só as operações do kernel-only tree", () => {
    const path = resolve(__dirname, "../../../openapi.json")
    const doc = JSON.parse(readFileSync(path, "utf8")) as OpenApiDocument

    const operations = Object.entries(doc.paths)
      .flatMap(([route, methods]) =>
        Object.entries(methods).map(
          ([method, op]) => `${method.toUpperCase()} ${route} :: ${op.operationId}`
        )
      )
      .sort()

    expect(operations).toMatchSnapshot()
  })
})
