import { type Mock, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { defineCatalogEntry } from "../../application/catalog/notification-catalog"
import { NotificationTemplateSourceRegistry } from "../../application/templates/notification-template-registry"
import {
  EmailBindingMissingError,
  EmailRecipientMissingError,
} from "../../domain/errors"

import { EmailChannel } from "./email.channel"

import type { Mailer } from "../../domain/ports/mailer"
import type { TemplateRenderer } from "../../domain/ports/template-renderer"

const BASE_EMAIL_CASES: readonly {
  type: string
  payload: Record<string, unknown>
  template: string
  subject: string
}[] = [
  {
    type: "access_link_sent",
    payload: {
      email: "a@b.com",
      name: "Ana",
      link: "https://app/x",
      tokenExpiresAt: "2099-01-01T00:00:00.000Z",
      locale: "pt-BR",
    },
    template: "access-link",
    subject: "Configure seu acesso à plataforma",
  },
  {
    type: "email_verification",
    payload: {
      email: "a@b.com",
      link: "https://app/v",
      tokenExpiresAt: "2099-01-01T00:00:00.000Z",
      locale: "pt-BR",
    },
    template: "verify",
    subject: "Verifique seu e-mail",
  },
  {
    type: "password_reset_requested",
    payload: {
      email: "a@b.com",
      link: "https://app/r",
      tokenExpiresAt: "2099-01-01T00:00:00.000Z",
      locale: "pt-BR",
    },
    template: "reset",
    subject: "Redefinição de senha",
  },
  {
    type: "account_lockout",
    payload: { email: "a@b.com", locale: "pt-BR" },
    template: "lockout",
    subject: "Conta bloqueada temporariamente",
  },
  {
    type: "password_changed",
    payload: {
      email: "a@b.com",
      at: "2026-06-10T18:30:00.000Z",
      locale: "pt-BR",
    },
    template: "password-changed",
    subject: "Sua senha foi alterada",
  },
  {
    type: "device_new_login",
    payload: {
      email: "a@b.com",
      deviceLabel: "Chrome/Linux",
      ip: null,
      at: "2026-06-10T18:30:00.000Z",
      locale: "pt-BR",
    },
    template: "device-new-login",
    subject: "Novo acesso à sua conta",
  },
  {
    type: "email_change_requested",
    payload: {
      email: "novo@b.com",
      link: "https://app/confirm-email",
      tokenExpiresAt: "2099-01-01T00:00:00.000Z",
      locale: "pt-BR",
    },
    template: "email-change",
    subject: "Confirme seu novo e-mail",
  },
  {
    type: "email_change_notice",
    payload: {
      email: "antigo@b.com",
      at: "2026-06-16T12:00:00.000Z",
      locale: "pt-BR",
    },
    template: "email-change-notice",
    subject: "Solicitação de troca de e-mail",
  },
]

describe("EmailChannel", () => {
  let render: Mock
  let send: Mock
  let channel: EmailChannel

  beforeEach(() => {
    render = vi.fn().mockReturnValue("<html>ok</html>")
    send = vi.fn().mockResolvedValue(undefined)
    const renderer: TemplateRenderer = { render }
    const mailer: Mailer = { send }
    channel = new EmailChannel(
      new NotificationTemplateSourceRegistry(),
      renderer,
      mailer
    )
  })

  it.each(BASE_EMAIL_CASES)(
    "$type: mesmo template/assunto do v0.1, to = data.email, idempotencyKey = delivery.id",
    async ({ type, payload, template, subject }) => {
      await channel.send({ id: "dlv-1", type, payload })
      expect(render).toHaveBeenCalledWith(template, expect.any(Object))
      expect(send).toHaveBeenCalledWith({
        to: payload.email,
        subject,
        html: "<html>ok</html>",
        idempotencyKey: "dlv-1",
      })
    }
  )

  it("aplica o `view` do binding antes de renderizar (password_changed formata o instante)", async () => {
    await channel.send({
      id: "dlv-pc",
      type: "password_changed",
      payload: {
        email: "a@b.com",
        at: "2026-06-10T18:30:00.000Z",
        locale: "pt-BR",
      },
    })
    expect(render).toHaveBeenCalledWith("password-changed", {
      at: "10/06/2026, 15:30",
    })
  })

  it("usa `recipient` do binding quando presente, em vez de data.email", async () => {
    const registry = new NotificationTemplateSourceRegistry()
    registry.register({
      type: "tipo_com_recipient" as never,
      catalog: defineCatalogEntry({
        category: "informational",
        channels: ["email"],
        dataSchema: z.object({ userId: z.string() }),
      }),
      email: {
        template: "produto",
        subject: () => "assunto do produto",
        recipient: (data) => {
          const { userId } = data as { userId: string }
          return `${userId}@produto.internal`
        },
      },
    })
    channel = new EmailChannel(registry, { render }, { send })

    await channel.send({
      id: "dlv-r",
      type: "tipo_com_recipient",
      payload: { userId: "u1" },
    })

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "u1@produto.internal" })
    )
  })

  it("tipo sem binding de e-mail → EmailBindingMissingError (retry/dead-letter no dispatcher)", async () => {
    await expect(
      channel.send({ id: "x", type: "device_revoked", payload: {} })
    ).rejects.toThrow(EmailBindingMissingError)
    await expect(
      channel.send({ id: "x", type: "device_revoked", payload: {} })
    ).rejects.toThrow(/device_revoked/)
  })

  it("recipient ausente e data.email não é string → EmailRecipientMissingError", async () => {
    await expect(
      channel.send({
        id: "x",
        type: "access_link_sent",
        payload: { name: "Ana", link: "https://app/x" },
      })
    ).rejects.toThrow(EmailRecipientMissingError)
    await expect(
      channel.send({
        id: "x",
        type: "access_link_sent",
        payload: { name: "Ana", link: "https://app/x" },
      })
    ).rejects.toThrow(/access_link_sent/)
  })
})
