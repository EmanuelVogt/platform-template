import type { RequestHandler } from "express"

// Stub do @scalar/nestjs-api-reference nos e2e: o pacote é ESM puro e o jest
// (CJS) não o transpila, então importar src/main (que monta as docs) quebra a
// suíte. A página de docs não é exercida em teste — um handler no-op basta.
export function apiReference(): RequestHandler {
  return (_req, _res, next) => {
    next()
  }
}
