import { describe, expect, it } from "vitest"

import { expectProblem } from "./problem"

import type { Response } from "supertest"

const problem = (
  status: number,
  body: Record<string, unknown>,
  contentType = "application/problem+json; charset=utf-8"
): Response =>
  ({
    status,
    headers: { "content-type": contentType },
    body,
  }) as unknown as Response

describe("expectProblem", () => {
  it("passa quando content-type, status e campos batem", () => {
    expectProblem(
      problem(404, {
        status: 404,
        type: "https://example.test/problems/http/404",
        title: "Não encontrado",
      }),
      { status: 404, type: "/http/404", title: "Não encontrado" }
    )
  })

  it("falha quando o corpo não é problem+json, mesmo com o status certo", () => {
    expect(() => {
      expectProblem(problem(404, { status: 404 }, "application/json"), {
        status: 404,
      })
    }).toThrow()
  })

  it("falha quando o status do corpo não acompanha o status HTTP", () => {
    expect(() => {
      expectProblem(problem(400, { status: 500 }), { status: 400 })
    }).toThrow()
  })

  it("falha quando o sufixo do type não bate", () => {
    expect(() => {
      expectProblem(problem(409, { status: 409, type: "/http/409" }), {
        status: 409,
        type: "/domain/email-taken",
      })
    }).toThrow()
  })

  it("campo não pedido não é cobrado", () => {
    expectProblem(problem(422, { status: 422, detail: "qualquer coisa" }), {
      status: 422,
    })
  })
})
