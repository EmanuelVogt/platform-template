import { describe, expect, it } from "vitest"

import { buildContentDisposition } from "./content-disposition"

describe("buildContentDisposition", () => {
  it("nome ASCII simples: filename= e filename* iguais, sem percent-encoding", () => {
    expect(buildContentDisposition("report.pdf")).toBe(
      "attachment; filename=\"report.pdf\"; filename*=UTF-8''report.pdf",
    )
  })

  it("nome com acento: filename= vira fallback sem o acento, filename* leva o RFC 5987", () => {
    expect(buildContentDisposition("relatório.pdf")).toBe(
      "attachment; filename=\"relatrio.pdf\"; filename*=UTF-8''relat%C3%B3rio.pdf",
    )
  })

  it("nome com aspas: aspas somem dos dois — não podem fechar o quoted-string", () => {
    expect(buildContentDisposition('a"b.txt')).toBe(
      "attachment; filename=\"ab.txt\"; filename*=UTF-8''ab.txt",
    )
  })

  it("nome com ' ( ) *: os quatro vêm percent-encoded em filename*, intactos em filename=", () => {
    expect(buildContentDisposition("a'b(c)d*e.txt")).toBe(
      "attachment; filename=\"a'b(c)d*e.txt\"; filename*=UTF-8''a%27b%28c%29d%2Ae.txt",
    )
  })

  it("nome vazio (null): cai no fallback genérico nos dois campos", () => {
    expect(buildContentDisposition(null)).toBe(
      "attachment; filename=\"arquivo\"; filename*=UTF-8''arquivo",
    )
  })

  it("remove CR e LF — filename vem do cliente e entra num header", () => {
    expect(buildContentDisposition("a\r\nX-Injected: 1.txt")).toBe(
      "attachment; filename=\"aX-Injected: 1.txt\"; filename*=UTF-8''aX-Injected%3A%201.txt",
    )
  })
})
