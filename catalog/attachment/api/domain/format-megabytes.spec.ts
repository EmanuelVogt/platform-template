import { describe, expect, it } from "vitest"

import { formatMegabytes } from "./format-megabytes"

describe("formatMegabytes", () => {
  it("converte o teto de 500 MB do perfil de feedback", () => {
    expect(formatMegabytes(524_288_000)).toBe("500 MB")
  })

  it("arredonda para o MB mais próximo", () => {
    expect(formatMegabytes(1_500_000)).toBe("1 MB")
  })

  it("mostra 0 MB para valor abaixo de meio MB", () => {
    expect(formatMegabytes(100)).toBe("0 MB")
  })
})
