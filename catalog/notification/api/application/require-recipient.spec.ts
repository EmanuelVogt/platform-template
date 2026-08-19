import { ForbiddenError } from "../../../shared/kernel/errors/forbidden.error"

import { requireRecipient } from "./require-recipient"

import type { RequestContext } from "../../../shared/kernel/context/request-context"

const ctxWith = (userId: string | null) =>
  ({ get: () => ({ userId }) }) as unknown as RequestContext

describe("requireRecipient", () => {
  it("retorna o userId autenticado", () => {
    expect(requireRecipient(ctxWith("u1"))).toBe("u1")
  })
  it("lança ForbiddenError sem userId (defesa em profundidade; guard já barrou)", () => {
    expect(() => requireRecipient(ctxWith(null))).toThrow(ForbiddenError)
  })
})
