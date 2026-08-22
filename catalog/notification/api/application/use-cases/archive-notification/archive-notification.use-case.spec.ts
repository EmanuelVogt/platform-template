import { type Mocked, describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { Notification } from "../../../domain/entities/notification.entity"

import { ArchiveNotificationUseCase } from "./archive-notification.use-case"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { NotificationRepositoryPort } from "../../../domain/ports/notification.repository.port"

const ctx = { getActor: () => ({ id: "u1", kind: "user" }) } as unknown as RequestContext
const clock = { now: () => new Date("2026-06-10T03:00:00Z") }

describe("ArchiveNotificationUseCase", () => {
  it("carrega com escopo de dono, arquiva pela entidade e persiste", async () => {
    const n = Notification.create({
      recipientId: "u1",
      type: "password_changed",
      title: "t",
      body: "b",
      actions: [],
      metadata: {},
      locale: "pt-BR",
    })
    const findByIdForRecipient = vi.fn().mockResolvedValue(n)
    let saved: Notification | undefined
    const update = vi.fn((notification: Notification) => {
      saved = notification
      return Promise.resolve()
    })
    const repo = {
      findByIdForRecipient,
      update,
    } as unknown as Mocked<NotificationRepositoryPort>

    await new ArchiveNotificationUseCase(repo, ctx, clock).execute({ id: n.props.id })

    expect(findByIdForRecipient).toHaveBeenCalledWith(n.props.id, "u1")
    expect(saved?.props.archivedAt).toEqual(new Date("2026-06-10T03:00:00Z"))
    expect(saved?.props.readAt).toBeNull()
  })

  it("id alheio/inexistente → no-op silencioso (sem oráculo de existência)", async () => {
    const update = vi.fn()
    const repo = {
      findByIdForRecipient: vi.fn().mockResolvedValue(null),
      update,
    } as unknown as Mocked<NotificationRepositoryPort>
    await new ArchiveNotificationUseCase(repo, ctx, clock).execute({ id: "alheio" })
    expect(update).not.toHaveBeenCalled()
  })

  it("contexto sem userId → lança ForbiddenError antes de consultar o repositório", async () => {
    const anonCtx = { getActor: () => null } as unknown as RequestContext
    const findByIdForRecipient = vi.fn()
    const update = vi.fn()
    const repo = {
      findByIdForRecipient,
      update,
    } as unknown as Mocked<NotificationRepositoryPort>

    await expect(
      new ArchiveNotificationUseCase(repo, anonCtx, clock).execute({ id: "any" })
    ).rejects.toThrow(ForbiddenError)

    expect(findByIdForRecipient).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
