import { describe, expect, it, vi } from "vitest"

import { Notification } from "../../../domain/entities/notification.entity"
import { NotificationMapper } from "../../mappers/notification.mapper"

import { ListNotificationsUseCase } from "./list-notifications.use-case"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { NotificationRepositoryPort } from "../../../domain/ports/notification.repository.port"

const ctx = { getActor: () => ({ id: "u1", kind: "user" }) } as unknown as RequestContext

describe("ListNotificationsUseCase", () => {
  it("lista com escopo de dono e devolve itens mapeados + paginação", async () => {
    const n = Notification.create({
      recipientId: "u1",
      type: "password_changed",
      title: "t",
      body: "b",
      actions: [],
      metadata: { at: "2026-06-10T00:00:00.000Z" },
      locale: "pt-BR",
    })
    const list = vi.fn().mockResolvedValue({ data: [n], total: 7 })
    const repo = { list } as unknown as NotificationRepositoryPort

    const out = await new ListNotificationsUseCase(
      repo,
      new NotificationMapper(),
      ctx,
    ).execute({ page: 2, pageSize: 5, filter: "unread" })

    expect(list).toHaveBeenCalledWith("u1", { page: 2, pageSize: 5, filter: "unread" })
    expect(out.data[0]).toMatchObject({ id: n.props.id, type: "password_changed" })
    expect(out.page).toMatchObject({ page: 2, pageSize: 5, total: 7 })
  })

  it("sem userId no contexto → lança (rota exige sessão)", async () => {
    const repo = { list: vi.fn() } as unknown as NotificationRepositoryPort
    const anon = { getActor: () => null } as unknown as RequestContext
    await expect(
      new ListNotificationsUseCase(repo, new NotificationMapper(), anon).execute({
        page: 1,
        pageSize: 10,
      }),
    ).rejects.toThrow()
  })
})
