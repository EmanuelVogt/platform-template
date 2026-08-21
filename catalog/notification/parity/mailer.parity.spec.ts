import { LogMailer } from "../infrastructure/mailer/log-mailer"

import type { LoggerFactory } from "../../../shared/kernel/logging/logger.factory"
import type { Mailer } from "../domain/ports/mailer"

describe("notification — Mailer é transporte puro (AD-008)", () => {
  it("a porta Mailer só expõe send(message) de um argumento", () => {
    const contract: Mailer = { send: async () => {} }
    expect(typeof contract.send).toBe("function")
    expect(LogMailer.prototype.send).toHaveLength(1)
  })

  it("LogMailer registra to, subject, idempotencyKey e os hrefs extraídos do HTML", async () => {
    const entries: Array<{ msg: string; meta: Record<string, unknown> }> = []
    const loggerFactory = {
      forModule: () => ({
        info: (msg: string, meta: Record<string, unknown>) => {
          entries.push({ msg, meta })
        },
      }),
    } as unknown as LoggerFactory
    const mailer = new LogMailer(loggerFactory)

    await mailer.send({
      to: "destinatario@example.com",
      subject: "assunto",
      html: '<a href="https://example.com/a">a</a><a href="https://example.com/b">b</a>',
      idempotencyKey: "delivery-1",
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]!.meta).toEqual({
      to: "destinatario@example.com",
      subject: "assunto",
      idempotencyKey: "delivery-1",
      links: ["https://example.com/a", "https://example.com/b"],
    })
  })
})
