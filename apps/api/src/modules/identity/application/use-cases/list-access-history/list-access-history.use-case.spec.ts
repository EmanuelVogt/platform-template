import { ListAccessHistoryUseCase } from "./list-access-history.use-case"
import { ACCESS_HISTORY_EVENT_TYPES } from "./types"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { AuthEventRepository } from "../../../domain/ports/auth-event.repository"

function makeCtx(userId: string | null): RequestContext {
  return { get: () => ({ userId, sessionId: userId ? "sess-1" : null }) } as unknown as RequestContext
}

describe("ListAccessHistoryUseCase", () => {
  it("repassa a allowlist e mapeia para a view sem campos sensíveis", async () => {
    const listByUser = jest.fn().mockResolvedValue({
      data: [
        { props: {
          id: "ev-1", userId: "u-1", eventType: "login_success",
          ip: "1.1.1.1", userAgent: "UA", emailHash: "SECRET",
          correlationId: "C", traceId: "T", spanId: "S", metadata: { x: 1 },
          actorUserId: null, createdAt: new Date("2026-01-01T00:00:00Z"),
        } },
      ],
      page: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    })
    const repo = { listByUser } as unknown as AuthEventRepository
    const useCase = new ListAccessHistoryUseCase(repo, makeCtx("u-1"))

    const out = await useCase.execute({ page: 1, pageSize: 20, order: "desc" })

    expect(listByUser).toHaveBeenCalledWith("u-1", { page: 1, pageSize: 20, order: "desc" }, ACCESS_HISTORY_EVENT_TYPES)
    expect(out.data[0]).toEqual({ id: "ev-1", eventType: "login_success", ipAddress: "1.1.1.1", userAgent: "UA", createdAt: "2026-01-01T00:00:00.000Z" })
    expect(out.data[0]).not.toHaveProperty("emailHash")
    expect(out.data[0]).not.toHaveProperty("correlationId")
    expect(out.page).toEqual({ total: 1, page: 1, pageSize: 20, totalPages: 1 })
  })

  it("lança sem usuário autenticado", async () => {
    const repo = { listByUser: jest.fn() } as unknown as AuthEventRepository
    const useCase = new ListAccessHistoryUseCase(repo, makeCtx(null))
    await expect(useCase.execute({ page: 1, pageSize: 20 })).rejects.toThrow()
  })
})
