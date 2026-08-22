import { apiReference } from "@scalar/nestjs-api-reference"
import { describe, expect, it } from "vitest"

import type { OpenAPIObject } from "@nestjs/swagger"

const MINIMAL_DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "kernel", version: "0.0.1" },
  paths: {},
} as unknown as OpenAPIObject

/**
 * RUN-04: o pacote do Scalar é ESM puro e sob o runner CJS anterior precisava
 * de um stub —
 * `test/setup/scalar-stub.ts`, que não existe mais. Sob o Vitest ele carrega
 * nativamente, então o import de verdade é parte da asserção.
 */
describe("@scalar/nestjs-api-reference", () => {
  it("entrega o middleware que mountDocs monta em /docs", () => {
    const handler = apiReference({ content: MINIMAL_DOCUMENT })

    expect(typeof handler).toBe("function")
    // Assinatura de middleware express: (req, res) no mínimo.
    expect(handler.length).toBeGreaterThanOrEqual(2)
  })
})
