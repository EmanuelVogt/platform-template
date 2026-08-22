import { beforeEach, describe, expect, it, vi } from "vitest"

import { LogMailer } from "./log-mailer"

import type { LoggerFactory } from "../../../../shared/kernel/logging/logger.factory"

describe("LogMailer", () => {
  const info = vi.fn()
  const loggerFactory = {
    forModule: () => ({ info, warn: vi.fn(), error: vi.fn() }),
  } as unknown as LoggerFactory

  beforeEach(() => info.mockClear())

  it("loga to, subject, idempotencyKey e os links extraídos do html", async () => {
    const mailer = new LogMailer(loggerFactory)
    await mailer.send({
      to: "a@b.com",
      subject: "Configure seu acesso à plataforma",
      html: '<a href="https://x.test/1">um</a><a href="https://x.test/2">dois</a>',
      idempotencyKey: "d1",
    })
    expect(info).toHaveBeenCalledWith("e-mail (dev)", {
      to: "a@b.com",
      subject: "Configure seu acesso à plataforma",
      idempotencyKey: "d1",
      links: ["https://x.test/1", "https://x.test/2"],
    })
  })

  it("html sem links → links vazio", async () => {
    const mailer = new LogMailer(loggerFactory)
    await mailer.send({
      to: "a@b.com",
      subject: "Conta bloqueada temporariamente",
      html: "<p>sem links aqui</p>",
    })
    expect(info).toHaveBeenCalledWith("e-mail (dev)", {
      to: "a@b.com",
      subject: "Conta bloqueada temporariamente",
      idempotencyKey: undefined,
      links: [],
    })
  })
})
