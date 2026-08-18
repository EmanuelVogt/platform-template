import { LogMailer } from "./log-mailer"

import type { LoggerFactory } from "../../../../shared/kernel/logging/logger.factory"

describe("LogMailer", () => {
  const info = jest.fn()
  const loggerFactory = {
    forModule: () => ({ info, warn: jest.fn(), error: jest.fn() }),
  } as unknown as LoggerFactory

  beforeEach(() => info.mockClear())

  it("loga cada tipo de envio com os campos do destino", async () => {
    const mailer = new LogMailer(loggerFactory)
    await mailer.sendAccessLink("a@b.com", "https://x/t", "Ana", "pt-BR", "d1")
    await mailer.sendPasswordReset("a@b.com", "https://x/r", "pt-BR", "d2")
    await mailer.sendEmailVerification("a@b.com", "https://x/v", "pt-BR", "d3")
    await mailer.sendLockoutNotice("a@b.com", "pt-BR", "d4")
    await mailer.sendPasswordChanged("a@b.com", "2026-06-10T00:00:00.000Z", "pt-BR", "d5")
    await mailer.sendDeviceNewLogin(
      "a@b.com",
      "Chrome/Linux",
      null,
      "2026-06-10T00:00:00.000Z",
      "pt-BR",
      "d6",
    )
    expect(info).toHaveBeenCalledTimes(6)
    expect(info).toHaveBeenNthCalledWith(
      5,
      expect.any(String),
      expect.objectContaining({ to: "a@b.com", at: "2026-06-10T00:00:00.000Z", idempotencyKey: "d5" }),
    )
    expect(info).toHaveBeenNthCalledWith(
      6,
      expect.any(String),
      expect.objectContaining({ deviceLabel: "Chrome/Linux", ip: null }),
    )
  })
})
