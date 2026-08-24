import { describe, expect, it } from "vitest"

import { NOTIFICATION_TYPES } from "../../api/events/notification-requested.event"

import {
  NOTIFICATION_MESSAGES,
  formatDateTime,
  notificationCatalog,
} from "./notification-catalog"

describe("notificationCatalog", () => {
  it("cobre todos os tipos do contrato do kernel", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(notificationCatalog[type]).toBeDefined()
    }
  })

  it("valida data de access_link_sent e rejeita campo faltante", () => {
    const entry = notificationCatalog.access_link_sent
    const ok = entry.dataSchema.safeParse({
      email: "a@b.com",
      name: "Ana",
      link: "https://app.local/configurar-senha?token=raw",
      tokenExpiresAt: "2026-06-17T00:00:00.000Z",
    })
    expect(ok.success).toBe(true)
    expect(entry.dataSchema.safeParse({ email: "a@b.com" }).success).toBe(false)
  })

  it("aceita link https e http, rejeita javascript: e data:", () => {
    const base = {
      email: "a@b.com",
      name: "Ana",
      tokenExpiresAt: "2026-06-17T00:00:00.000Z",
    }
    const { dataSchema } = notificationCatalog.access_link_sent
    expect(
      dataSchema.safeParse({
        ...base,
        link: "https://app.local/configurar-senha?token=raw",
      }).success
    ).toBe(true)
    expect(
      dataSchema.safeParse({
        ...base,
        link: "http://app.local/configurar-senha?token=raw",
      }).success
    ).toBe(true)
    expect(
      dataSchema.safeParse({ ...base, link: "javascript:alert(1)" }).success
    ).toBe(false)
    expect(
      dataSchema.safeParse({
        ...base,
        link: "data:text/html,<script>alert(1)</script>",
      }).success
    ).toBe(false)
  })

  it("metadata de tipo in-app NUNCA contém token/link", () => {
    for (const type of NOTIFICATION_TYPES) {
      const entry = notificationCatalog[type]
      if (!entry.metadata) continue
      const data = {
        email: "a@b.com",
        at: "2026-06-10T00:00:00.000Z",
        deviceLabel: "Chrome/Linux",
        ip: "10.0.0.1",
        deviceId: "d1",
        userName: "Ana",
        link: "https://evil.example/raw-token",
      }
      const meta = entry.metadata(entry.dataSchema.parse({ ...data }))
      expect(JSON.stringify(meta)).not.toContain("link")
      expect(JSON.stringify(meta)).not.toContain("token")
    }
  })

  it("todo tipo com canal system tem renderInApp e metadata", () => {
    for (const type of NOTIFICATION_TYPES) {
      const entry = notificationCatalog[type]
      // SPEC_DEVIATION: `if` vira early `continue` para tirar o `expect` de dentro do condicional.
      // Reason: `@vitest/eslint-plugin` (LNT-01) passa a barrar `no-conditional-expect`.
      if (!entry.channels.includes("system")) continue
      expect(entry.renderInApp).toBeDefined()
      expect(entry.metadata).toBeDefined()
    }
  })

  it("renderInApp de password_set monta título/corpo pt-BR", () => {
    const rendered = notificationCatalog.password_set.renderInApp?.(
      notificationCatalog.password_set.dataSchema.parse({ userName: "Ana" })
    )
    expect(rendered?.title).toBe("Conta ativada")
    expect(rendered?.body).toContain("Ana")
    expect(rendered?.actions).toEqual([])
  })

  it("renderInApp de password_changed formata o instante em pt-BR", () => {
    const rendered = notificationCatalog.password_changed.renderInApp?.(
      notificationCatalog.password_changed.dataSchema.parse({
        email: "a@b.com",
        at: "2026-06-10T18:30:00.000Z",
      })
    )
    expect(rendered?.title).toBe("Senha alterada")
    expect(rendered?.body).toContain("10/06/2026, 15:30")
  })

  it("renderInApp de device_new_login inclui label e instante", () => {
    const rendered = notificationCatalog.device_new_login.renderInApp?.(
      notificationCatalog.device_new_login.dataSchema.parse({
        email: "a@b.com",
        deviceLabel: "Chrome/Linux",
        ip: null,
        at: "2026-06-10T18:30:00.000Z",
      })
    )
    expect(rendered?.title).toBe("Novo dispositivo acessou sua conta")
    expect(rendered?.body).toContain("Chrome/Linux")
    expect(rendered?.body).toContain("10/06/2026, 15:30")
  })

  it("renderInApp de device_revoked tem corpo fixo sem dados do device", () => {
    const rendered = notificationCatalog.device_revoked.renderInApp?.(
      notificationCatalog.device_revoked.dataSchema.parse({ deviceId: "d1" })
    )
    expect(rendered?.title).toBe("Dispositivo desconectado")
    expect(rendered?.body).not.toContain("d1")
  })

  it("NOTIFICATION_MESSAGES expõe a tabela única de assuntos, inalterada por padrão", () => {
    expect(NOTIFICATION_MESSAGES.subjects.password_reset_requested).toBe(
      "Redefinição de senha"
    )
    expect(NOTIFICATION_MESSAGES.inApp.passwordChangedTitle).toBe(
      "Senha alterada"
    )
  })

  it("formatDateTime lê o locale do kernel (DEFAULT_LOCALE) e reproduz a formatação de hoje por padrão", () => {
    expect(formatDateTime("2026-06-10T18:30:00.000Z")).toBe("10/06/2026, 15:30")
  })
})
