import { describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { fakeRequestContext } from "../../request-context.fixture"

import { LogoutUseCase } from "./logout.use-case"

function makeDeps(ctxStore: Record<string, any>) {
  const sessions = { deleteById: vi.fn().mockResolvedValue(1) }
  const authEvents = { recordInTx: vi.fn().mockResolvedValue(undefined) }
  const ctx = fakeRequestContext(() => ({
    ip: null,
    userAgent: null,
    correlationId: "c1",
    locale: "pt-BR",
    ...ctxStore,
  }))
  const uc = new LogoutUseCase(sessions as never, authEvents as never, ctx)
  return { uc, sessions, authEvents }
}

describe("LogoutUseCase", () => {
  it("sem sessionId lança ForbiddenError e NÃO apaga a sessão", async () => {
    const t = makeDeps({ userId: "u-1", sessionId: null })
    await expect(t.uc.execute({})).rejects.toBeInstanceOf(ForbiddenError)
    expect(t.sessions.deleteById).not.toHaveBeenCalled()
  })

  it("happy: apaga a sessão própria (escopo por dono) e audita logout", async () => {
    const t = makeDeps({ userId: "u-1", sessionId: "s-1" })
    await t.uc.execute({})
    expect(t.sessions.deleteById).toHaveBeenCalledWith("s-1", "u-1")
    expect(t.authEvents.recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "logout" }),
      })
    )
  })
})
