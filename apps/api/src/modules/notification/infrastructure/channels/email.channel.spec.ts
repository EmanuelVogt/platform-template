import { EmailChannel } from "./email.channel"

import type { Mailer } from "../../domain/ports/mailer"

const sendAccessLink = jest.fn()
const sendPasswordReset = jest.fn()
const sendEmailVerification = jest.fn()
const sendLockoutNotice = jest.fn()
const sendPasswordChanged = jest.fn()
const sendDeviceNewLogin = jest.fn()
const sendEmailChangeConfirmation = jest.fn()
const sendEmailChangeNotice = jest.fn()

const mailer: Mailer = {
  sendAccessLink,
  sendPasswordReset,
  sendEmailVerification,
  sendLockoutNotice,
  sendPasswordChanged,
  sendDeviceNewLogin,
  sendEmailChangeConfirmation,
  sendEmailChangeNotice,
}

describe("EmailChannel", () => {
  beforeEach(() => jest.clearAllMocks())

  it("despacha access_link_sent pro método certo com idempotencyKey = delivery.id", async () => {
    const channel = new EmailChannel(mailer)
    await channel.send({
      id: "dlv-1",
      type: "access_link_sent",
      payload: {
        email: "a@b.com",
        name: "Ana",
        link: "https://app/x",
        tokenExpiresAt: "2026-06-17T00:00:00.000Z",
        locale: "pt-BR",
      },
    })
    expect(sendAccessLink).toHaveBeenCalledWith(
      "a@b.com",
      "https://app/x",
      "Ana",
      "pt-BR",
      "dlv-1"
    )
  })

  it("account_lockout não exige link", async () => {
    const channel = new EmailChannel(mailer)
    await channel.send({
      id: "dlv-2",
      type: "account_lockout",
      payload: { email: "a@b.com", locale: "pt-BR" },
    })
    expect(sendLockoutNotice).toHaveBeenCalledWith("a@b.com", "pt-BR", "dlv-2")
  })

  it("despacha email_verification e password_reset_requested com o link", async () => {
    const channel = new EmailChannel(mailer)
    await channel.send({
      id: "dlv-v",
      type: "email_verification",
      payload: { email: "a@b.com", link: "https://app/v", tokenExpiresAt: "2099-01-01T00:00:00.000Z", locale: "pt-BR" },
    })
    expect(sendEmailVerification).toHaveBeenCalledWith("a@b.com", "https://app/v", "pt-BR", "dlv-v")
    await channel.send({
      id: "dlv-r",
      type: "password_reset_requested",
      payload: { email: "a@b.com", link: "https://app/r", tokenExpiresAt: "2099-01-01T00:00:00.000Z", locale: "pt-BR" },
    })
    expect(sendPasswordReset).toHaveBeenCalledWith("a@b.com", "https://app/r", "pt-BR", "dlv-r")
  })

  it("despacha password_changed com instante e idempotencyKey", async () => {
    const channel = new EmailChannel(mailer)
    await channel.send({
      id: "dlv-3",
      type: "password_changed",
      payload: { email: "a@b.com", at: "2026-06-10T00:00:00.000Z", locale: "pt-BR" },
    })
    expect(sendPasswordChanged).toHaveBeenCalledWith(
      "a@b.com",
      "2026-06-10T00:00:00.000Z",
      "pt-BR",
      "dlv-3"
    )
  })

  it("despacha device_new_login com label/ip nullable", async () => {
    const channel = new EmailChannel(mailer)
    await channel.send({
      id: "dlv-4",
      type: "device_new_login",
      payload: {
        email: "a@b.com",
        deviceLabel: "Chrome/Linux",
        ip: null,
        at: "2026-06-10T00:00:00.000Z",
        locale: "pt-BR",
      },
    })
    expect(sendDeviceNewLogin).toHaveBeenCalledWith(
      "a@b.com",
      "Chrome/Linux",
      null,
      "2026-06-10T00:00:00.000Z",
      "pt-BR",
      "dlv-4"
    )
  })

  it("despacha email_change_requested com link de confirmação e idempotencyKey", async () => {
    const channel = new EmailChannel(mailer)
    await channel.send({
      id: "dlv-ecr",
      type: "email_change_requested",
      payload: {
        email: "novo@b.com",
        link: "https://app/confirm-email",
        tokenExpiresAt: "2099-01-01T00:00:00.000Z",
        locale: "pt-BR",
      },
    })
    expect(sendEmailChangeConfirmation).toHaveBeenCalledWith(
      "novo@b.com",
      "https://app/confirm-email",
      "pt-BR",
      "dlv-ecr"
    )
    expect(sendEmailChangeNotice).not.toHaveBeenCalled()
  })

  it("despacha email_change_notice com instante e idempotencyKey, sem chamar outros mailers", async () => {
    const channel = new EmailChannel(mailer)
    await channel.send({
      id: "dlv-ecn",
      type: "email_change_notice",
      payload: {
        email: "antigo@b.com",
        at: "2026-06-16T12:00:00.000Z",
        locale: "en",
      },
    })
    expect(sendEmailChangeNotice).toHaveBeenCalledWith(
      "antigo@b.com",
      "2026-06-16T12:00:00.000Z",
      "en",
      "dlv-ecn"
    )
    expect(sendEmailChangeConfirmation).not.toHaveBeenCalled()
  })

  it("tipo sem template de e-mail → throw (vira failed/dead_letter no dispatcher)", async () => {
    const channel = new EmailChannel(mailer)
    await expect(
      channel.send({ id: "x", type: "device_revoked", payload: {} })
    ).rejects.toThrow(/sem envio de e-mail/)
  })
})
