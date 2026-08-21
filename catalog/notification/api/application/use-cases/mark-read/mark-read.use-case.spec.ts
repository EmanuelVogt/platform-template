import { Notification } from "../../../domain/entities/notification.entity"

import { MarkReadUseCase } from "./mark-read.use-case"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { NotificationRepositoryPort } from "../../../domain/ports/notification.repository.port"

const ctx = { getActor: () => ({ id: "u1", kind: "user" }) } as unknown as RequestContext
const clock = { now: () => new Date("2026-06-10T01:00:00Z") }

describe("MarkReadUseCase", () => {
  it("carrega com escopo de dono, transiciona pela entidade e persiste", async () => {
    const n = Notification.create({
      recipientId: "u1",
      type: "password_changed",
      title: "t",
      body: "b",
      actions: [],
      metadata: {},
      locale: "pt-BR",
    })
    const findByIdForRecipient = jest.fn().mockResolvedValue(n)
    let saved: Notification | undefined
    const update = jest.fn((notification: Notification) => {
      saved = notification
      return Promise.resolve()
    })
    const repo = {
      findByIdForRecipient,
      update,
    } as unknown as jest.Mocked<NotificationRepositoryPort>

    await new MarkReadUseCase(repo, ctx, clock).execute({ id: n.props.id })

    expect(findByIdForRecipient).toHaveBeenCalledWith(n.props.id, "u1")
    expect(saved?.props.readAt).toEqual(new Date("2026-06-10T01:00:00Z"))
    expect(saved?.props.seenAt).toEqual(new Date("2026-06-10T01:00:00Z"))
  })

  it("id alheio/inexistente → no-op silencioso (sem oráculo de existência)", async () => {
    const update = jest.fn()
    const repo = {
      findByIdForRecipient: jest.fn().mockResolvedValue(null),
      update,
    } as unknown as jest.Mocked<NotificationRepositoryPort>
    await new MarkReadUseCase(repo, ctx, clock).execute({ id: "alheio" })
    expect(update).not.toHaveBeenCalled()
  })
})
