import { describe, expect, it } from "vitest"

import {
  MIN_PASSWORD_STRENGTH_SCORE,
  PASSWORD_TOO_WEAK_MESSAGE,
} from "./password-policy"

describe("password-policy", () => {
  it("fixa o score mínimo alinhado ao backend", () => {
    expect(MIN_PASSWORD_STRENGTH_SCORE).toBe(3)
  })

  it("expõe a mensagem pt-BR de senha fraca", () => {
    expect(PASSWORD_TOO_WEAK_MESSAGE).toMatch(/senha é muito fraca/i)
  })
})
