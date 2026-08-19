import {
  listNotificationsQuerySchema,
  notificationItemSchema,
} from "./notification.contract"

const baseItem = {
  id: "01HX",
  title: "t",
  body: "b",
  actions: [],
  locale: "pt-BR",
  seenAt: null,
  readAt: null,
  archivedAt: null,
  createdAt: "2026-06-10T00:00:00.000Z",
}

describe("notification.contract", () => {
  it("query: defaults de paginação + filter opcional validado", () => {
    expect(listNotificationsQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
    })
    expect(
      listNotificationsQuerySchema.safeParse({ filter: "nope" }).success
    ).toBe(false)
  })

  it("item: union discriminada por type tipa a metadata", () => {
    const ok = notificationItemSchema.safeParse({
      ...baseItem,
      type: "device_new_login",
      metadata: { deviceLabel: "Chrome", ip: null, at: "2026-06-10T00:00:00.000Z" },
    })
    expect(ok.success).toBe(true)
    const wrongMeta = notificationItemSchema.safeParse({
      ...baseItem,
      type: "device_new_login",
      metadata: { userName: "Ana" },
    })
    expect(wrongMeta.success).toBe(false)
  })

  it("deepLink só aceita path relativo (anti open-redirect)", () => {
    const r = notificationItemSchema.safeParse({
      ...baseItem,
      type: "password_set",
      metadata: { userName: "Ana" },
      actions: [{ label: "Abrir", deepLink: "https://evil.example/x" }],
    })
    expect(r.success).toBe(false)
  })
})
