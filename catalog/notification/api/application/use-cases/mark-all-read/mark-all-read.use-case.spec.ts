import { describe, expect, it, vi } from "vitest"

import { MarkAllReadUseCase } from "./mark-all-read.use-case"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { NotificationRepositoryPort } from "../../../domain/ports/notification.repository.port"

describe("MarkAllReadUseCase", () => {
  it("marca todas como lidas (implica vistas) com o instante do clock", async () => {
    const markAllRead = vi.fn().mockResolvedValue(2)
    const repo = { markAllRead } as unknown as NotificationRepositoryPort
    const ctx = {
      getActor: () => ({ id: "u1", kind: "user" }),
    } as unknown as RequestContext
    const at = new Date("2026-06-10T01:00:00Z")

    await new MarkAllReadUseCase(repo, ctx, { now: () => at }).execute()

    expect(markAllRead).toHaveBeenCalledWith("u1", at)
  })
})
