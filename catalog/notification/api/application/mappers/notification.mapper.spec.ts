import { Notification } from "../../domain/entities/notification.entity"

import { NotificationMapper } from "./notification.mapper"

describe("NotificationMapper", () => {
  const mapper = new NotificationMapper()

  it("serializa datas em ISO e preserva metadata/actions", () => {
    const n = new Notification({
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      recipientId: "u1",
      type: "device_new_login",
      title: "Novo dispositivo acessou sua conta",
      body: "corpo",
      actions: [{ label: "Ver", deepLink: "/dispositivos" }],
      metadata: { deviceLabel: "Chrome", ip: null, at: "2026-06-10T00:00:00.000Z" },
      locale: "pt-BR",
      seenAt: new Date("2026-06-10T01:00:00Z"),
      readAt: null,
      archivedAt: null,
      createdAt: new Date("2026-06-10T00:00:00Z"),
    })
    const item = mapper.toItem(n)
    expect(item).toEqual({
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      type: "device_new_login",
      title: "Novo dispositivo acessou sua conta",
      body: "corpo",
      actions: [{ label: "Ver", deepLink: "/dispositivos" }],
      metadata: { deviceLabel: "Chrome", ip: null, at: "2026-06-10T00:00:00.000Z" },
      locale: "pt-BR",
      seenAt: "2026-06-10T01:00:00.000Z",
      readAt: null,
      archivedAt: null,
      createdAt: "2026-06-10T00:00:00.000Z",
    })
  })

  it("actions retornadas são cópia (mutação não vaza pra entidade congelada)", () => {
    const n = Notification.create({
      recipientId: "u1",
      type: "password_changed",
      title: "t",
      body: "b",
      actions: [],
      metadata: { at: "2026-06-10T00:00:00.000Z" },
      locale: "pt-BR",
    })
    const item = mapper.toItem(n)
    item.actions.push({ label: "x", deepLink: "/x" })
    expect(n.props.actions).toHaveLength(0)
  })
})
