import { describe, expect, it } from "vitest"

import { cookieHeader, cookieValue } from "./http"

import type { Response } from "supertest"

const res = (setCookie: string | string[] | undefined): Response =>
  ({ headers: { "set-cookie": setCookie } }) as unknown as Response

describe("leitores de Set-Cookie", () => {
  it("cookieHeader devolve todos os cookies da resposta", () => {
    expect(cookieHeader(res(["a=1; Path=/", "b=2; HttpOnly"]))).toEqual([
      "a=1; Path=/",
      "b=2; HttpOnly",
    ])
  })

  it("cookieHeader normaliza o header de valor único para lista", () => {
    expect(cookieHeader(res("a=1; Path=/"))).toEqual(["a=1; Path=/"])
  })

  it("cookieHeader devolve lista vazia quando a resposta não põe cookie", () => {
    expect(cookieHeader(res(undefined))).toEqual([])
  })

  it("cookieValue devolve o valor sem os atributos", () => {
    expect(
      cookieValue(res(["sid=abc.def; Path=/; HttpOnly; SameSite=Lax"]), "sid")
    ).toBe("abc.def")
  })

  it("cookieValue devolve undefined para um cookie ausente", () => {
    expect(cookieValue(res(["sid=abc"]), "csrf")).toBeUndefined()
  })

  it("cookieValue não confunde um cookie cujo nome é prefixo de outro", () => {
    expect(cookieValue(res(["sid_old=1", "sid=2"]), "sid")).toBe("2")
  })
})
