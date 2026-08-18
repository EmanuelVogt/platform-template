import { z } from "zod"

import { NOTIFICATION_TYPES } from "../../api/events/notification-requested.event"
import { defineCatalogEntry } from "../catalog/notification-catalog"

import {
  DuplicateNotificationTemplateSourceError,
  NotificationTemplateSourceNotRegisteredError,
  NotificationTemplateSourceRegistry,
} from "./notification-template-registry"

const EMAIL_TYPES = [
  "access_link_sent",
  "email_verification",
  "password_reset_requested",
  "account_lockout",
  "password_changed",
  "device_new_login",
  "email_change_requested",
  "email_change_notice",
] as const

const SYSTEM_ONLY_TYPES = ["device_revoked", "password_set"] as const

describe("NotificationTemplateSourceRegistry", () => {
  it("semeia os 10 tipos base no construtor", () => {
    const registry = new NotificationTemplateSourceRegistry()
    for (const type of NOTIFICATION_TYPES) {
      expect(registry.find(type)).toBeDefined()
    }
  })

  it("os 8 tipos de e-mail têm binding `email`", () => {
    const registry = new NotificationTemplateSourceRegistry()
    for (const type of EMAIL_TYPES) {
      expect(registry.find(type)?.email).toBeDefined()
    }
  })

  it("os 2 tipos só-sistema não têm binding `email`", () => {
    const registry = new NotificationTemplateSourceRegistry()
    for (const type of SYSTEM_ONLY_TYPES) {
      expect(registry.find(type)?.email).toBeUndefined()
    }
  })

  it("registrar o mesmo tipo duas vezes lança nomeando o tipo", () => {
    const registry = new NotificationTemplateSourceRegistry()
    expect(() =>
      registry.register({
        type: "access_link_sent",
        catalog: defineCatalogEntry({
          category: "transactional",
          channels: ["email"],
          dataSchema: z.object({}),
        }),
      }),
    ).toThrow(DuplicateNotificationTemplateSourceError)
  })

  it("require de um tipo não registrado lança nomeando o tipo", () => {
    const registry = new NotificationTemplateSourceRegistry()
    expect(() => registry.require("tipo_inexistente" as never)).toThrow(
      NotificationTemplateSourceNotRegisteredError,
    )
  })

  it("findByTemplate resolve o binding de e-mail pelo nome do template", () => {
    const registry = new NotificationTemplateSourceRegistry()
    expect(registry.findByTemplate("access-link")?.template).toBe("access-link")
    expect(registry.findByTemplate("template-desconhecido")).toBeUndefined()
  })
})
