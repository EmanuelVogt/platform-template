import { NotificationRequested } from "./notification-requested.event"

describe("NotificationRequested", () => {
  it("monta o envelope com aggregate = recipient (FIFO-local por destinatário)", () => {
    const event = NotificationRequested.from({
      recipientId: "user-1",
      type: "account_lockout",
      locale: "pt-BR",
      data: { email: "a@b.com" },
    })
    expect(event.eventName).toBe("notification.requested")
    expect(event.eventVersion).toBe(1)
    expect(event.aggregateId).toBe("user-1")
    expect(event.aggregateType).toBe("Notification")
    expect(event.payload).toEqual({
      recipientId: "user-1",
      type: "account_lockout",
      locale: "pt-BR",
      data: { email: "a@b.com" },
    })
    expect(event.eventId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})
