import { describe, expect, it } from "vitest"

import { DomainError } from "./domain.error"
import { ForbiddenError } from "./forbidden.error"

describe("ForbiddenError do kernel", () => {
  it("estende DomainError: status 403, type único sem namespace de módulo, título pt-BR", () => {
    const err = new ForbiddenError()
    expect(err).toBeInstanceOf(DomainError)
    expect(err.status).toBe(403)
    expect(err.type).toBe("https://errors.example.com/forbidden")
    expect(err.title).toBe("Acesso negado")
  })

  it("repassa o detail para a mensagem", () => {
    const err = new ForbiddenError("Não é possível excluir o usuário master.")
    expect(err.message).toBe("Não é possível excluir o usuário master.")
    expect(err.title).toBe("Acesso negado")
  })
})
