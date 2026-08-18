import { MarkAllSeenUseCase } from "./mark-all-seen.use-case"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { NotificationRepositoryPort } from "../../../domain/ports/notification.repository.port"

describe("MarkAllSeenUseCase", () => {
  it("marca todas as não-vistas do recipient com o instante do clock", async () => {
    const markAllSeen = jest.fn().mockResolvedValue(2)
    const repo = { markAllSeen } as unknown as NotificationRepositoryPort
    const ctx = { get: () => ({ userId: "u1" }) } as unknown as RequestContext
    const at = new Date("2026-06-10T01:00:00Z")

    await new MarkAllSeenUseCase(repo, ctx, { now: () => at }).execute()

    expect(markAllSeen).toHaveBeenCalledWith("u1", at)
  })
})
