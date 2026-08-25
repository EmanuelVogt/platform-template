import { expect } from "vitest"

import type { Response } from "supertest"

export type ExpectedProblem = {
  status: number
  /** Sufixo do `type` (`/http/404`), não a URL inteira. */
  type?: string
  title?: string
  detail?: string
  code?: string
}

/**
 * Única forma de afirmar uma resposta RFC 7807: content-type, status no corpo e
 * os campos dados. Um `expect(res.status).toBe(400)` solto não vê corpo de
 * problema nenhum — passa igual quando o filtro devolve HTML de erro.
 */
export function expectProblem(res: Response, expected: ExpectedProblem): void {
  expect(res.headers["content-type"]).toContain("application/problem+json")
  expect(res.status).toBe(expected.status)
  const body = res.body as Record<string, unknown>
  expect(body.status).toBe(expected.status)
  if (expected.type !== undefined) {
    expect(String(body.type)).toContain(expected.type)
  }
  for (const field of ["title", "detail", "code"] as const) {
    if (expected[field] !== undefined) {
      expect(body[field]).toBe(expected[field])
    }
  }
}
