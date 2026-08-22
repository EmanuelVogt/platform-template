import { buildContentDisposition } from "./content-disposition"
import { describe, expect, it } from "vitest"

describe("buildContentDisposition", () => {
  it("codifica acento em RFC 5987", () => {
    expect(buildContentDisposition("relatório.pdf")).toBe(
      "attachment; filename*=UTF-8''relat%C3%B3rio.pdf",
    )
  })

  it("remove CR e LF — filename vem do cliente e entra num header", () => {
    expect(buildContentDisposition("a\r\nX-Injected: 1.txt")).toBe(
      "attachment; filename*=UTF-8''aX-Injected%3A%201.txt",
    )
  })

  it("cai num nome genérico quando não há filename", () => {
    expect(buildContentDisposition(null)).toBe("attachment; filename*=UTF-8''arquivo")
  })
})
