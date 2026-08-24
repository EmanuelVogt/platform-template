import { describe, expect, it } from "vitest"

import { WeakPasswordError } from "./errors"
import { validatePasswordPolicy } from "./password-policy"

const policy = { minZxcvbnScore: 3 }

describe("validatePasswordPolicy", () => {
  it("lança WeakPasswordError quando zxcvbnScore < minZxcvbnScore", () => {
    expect(() => {
      validatePasswordPolicy({ ...policy, zxcvbnScore: 2 })
    }).toThrow(WeakPasswordError)
  })

  it("não lança quando score atende", () => {
    expect(() => {
      validatePasswordPolicy({ ...policy, zxcvbnScore: 4 })
    }).not.toThrow()
  })

  it("borda: score exatamente igual a minZxcvbnScore é aceito", () => {
    expect(() => {
      validatePasswordPolicy({ ...policy, zxcvbnScore: 3 })
    }).not.toThrow()
  })

  it("não chama zxcvbn: usa o score recebido (pureza)", () => {
    expect(() => {
      validatePasswordPolicy({ ...policy, zxcvbnScore: 0 })
    }).toThrow(WeakPasswordError)
  })

  it("mensagem de erro de fraqueza é a descrição de força insuficiente", () => {
    expect(() => {
      validatePasswordPolicy({ ...policy, zxcvbnScore: 1 })
    }).toThrow("A senha é muito fraca. Escolha uma mais difícil de adivinhar.")
  })
})
