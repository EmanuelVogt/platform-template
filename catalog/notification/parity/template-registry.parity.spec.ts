import { describe, expect, it } from "vitest"

import { BASE_TEMPLATE_SOURCES } from "../application/templates/base-template-sources"
import { NotificationTemplateSourceRegistry } from "../application/templates/notification-template-registry"
import { EmailChannel } from "../infrastructure/channels/email.channel"

import type { Mailer } from "../domain/ports/mailer"
import type { NotificationTemplateSources } from "../domain/ports/notification-template-source.port"
import type { TemplateRenderer } from "../domain/ports/template-renderer"

describe("notification — fonte de template registrada (AD-007)", () => {
  it("registra os tipos do base-set pelo mesmo registry usado pelo produto", () => {
    const registry = new NotificationTemplateSourceRegistry()
    for (const source of BASE_TEMPLATE_SOURCES) {
      expect(registry.find(source.type)).toBe(source)
    }
  })

  it("fonte registrada tem a forma { type, catalog, email? }", () => {
    // SPEC_DEVIATION: chaves aceitas como subconjunto de ["catalog","email","type"],
    // não mais um toEqual fixo com "email" obrigatório.
    // Reason: o próprio nome do teste já marca "email?" como opcional, e o base-set
    // real tem fontes system-only sem binding de e-mail — device_revoked e password_set
    // têm channels: ["system"] em notification-catalog.ts (sem "email" na lista de
    // canais) —, então a asserção anterior contradizia o nome do teste e o base-set.
    for (const source of BASE_TEMPLATE_SOURCES) {
      const keys = Object.keys(source).sort()
      expect(keys).toEqual(expect.arrayContaining(["catalog", "type"]))
      expect(
        keys.every((key) => ["catalog", "email", "type"].includes(key))
      ).toBe(true)
      // SPEC_DEVIATION: `if` vira early `continue` para tirar o `expect` de dentro do condicional.
      // Reason: `@vitest/eslint-plugin` (LNT-01) passa a barrar `no-conditional-expect`.
      if (!source.email) continue
      expect(typeof source.email.template).toBe("string")
      expect(typeof source.email.subject).toBe("function")
    }
  })

  it("templateDir ausente no base-set — usa a pasta de templates do próprio módulo", () => {
    const source = BASE_TEMPLATE_SOURCES.find(
      (s) => s.type === "email_verification"
    )
    expect(source?.email?.templateDir).toBeUndefined()
  })

  it("recipient ausente cai para data.email", async () => {
    const templateSources: NotificationTemplateSources = {
      require: () => ({
        email: { template: "verify", subject: () => "assunto" },
      }),
      findByTemplate: () => undefined,
    }
    const renderer: TemplateRenderer = { render: () => "<html></html>" }
    const sent: unknown[] = []
    const mailer: Mailer = {
      send: async (message) => {
        sent.push(message)
      },
    }
    const channel = new EmailChannel(templateSources, renderer, mailer)

    await channel.send({
      id: "delivery-1",
      type: "email_verification",
      payload: { email: "destinatario@example.com" },
    })

    expect(sent).toEqual([
      {
        to: "destinatario@example.com",
        subject: "assunto",
        html: "<html></html>",
        idempotencyKey: "delivery-1",
      },
    ])
  })

  it("view ausente cai para identidade — o payload inteiro vai pro renderer", async () => {
    const templateSources: NotificationTemplateSources = {
      require: () => ({
        email: { template: "verify", subject: () => "assunto" },
      }),
      findByTemplate: () => undefined,
    }
    const seen: Record<string, unknown>[] = []
    const renderer: TemplateRenderer = {
      render: (_template, data) => {
        seen.push(data)
        return "<html></html>"
      },
    }
    const mailer: Mailer = { send: async () => undefined }
    const channel = new EmailChannel(templateSources, renderer, mailer)
    const payload = { email: "destinatario@example.com", extra: "valor" }

    await channel.send({
      id: "delivery-2",
      type: "email_verification",
      payload,
    })

    expect(seen).toEqual([payload])
  })
})
