import { z } from "zod"

import type { NOTIFICATION_TYPES } from "../../api/events/notification-requested.event"

export type NotificationCategory = "security" | "transactional" | "informational"
export type NotificationChannelKind = "system" | "email" | "push"

export type RenderedInApp = {
  title: string
  body: string
  actions: { label: string; deepLink: string }[]
}

export type CatalogEntry = {
  category: NotificationCategory
  channels: readonly NotificationChannelKind[]
  dataSchema: z.ZodType<Record<string, unknown>>
  /** Projeção data → metadata in-app. NUNCA inclui token/link — garantia por construção. */
  metadata?: (data: unknown) => Record<string, unknown>
  renderInApp?: (data: unknown) => RenderedInApp
}

// O cast localiza a perda de tipo: as funções internas são tipadas pelo schema
// da entrada; o registro exposto opera sobre unknown (o handler só tem o type
// em runtime).
function entry<S extends z.ZodType<Record<string, unknown>>>(e: {
  category: NotificationCategory
  channels: readonly NotificationChannelKind[]
  dataSchema: S
  metadata?: (data: z.output<S>) => Record<string, unknown>
  renderInApp?: (data: z.output<S>) => RenderedInApp
}): CatalogEntry {
  return e as CatalogEntry
}

export { entry as defineCatalogEntry }

const isoDate = z.iso.datetime()

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso))
}

export const accessLinkSentData = z.object({
  email: z.email(),
  name: z.string().min(1),
  link: z.url({ protocol: /^https?$/ }),
  tokenExpiresAt: isoDate,
})
export const emailVerificationData = z.object({
  email: z.email(),
  link: z.url({ protocol: /^https?$/ }),
  tokenExpiresAt: isoDate,
})
export const passwordResetRequestedData = z.object({
  email: z.email(),
  link: z.url({ protocol: /^https?$/ }),
  tokenExpiresAt: isoDate,
})
export const accountLockoutData = z.object({ email: z.email() })
export const passwordChangedData = z.object({ email: z.email(), at: isoDate })
export const deviceNewLoginData = z.object({
  email: z.email(),
  deviceLabel: z.string().min(1),
  ip: z.string().nullable(),
  at: isoDate,
})
export const deviceRevokedData = z.object({ deviceId: z.string().min(1) })
export const passwordSetData = z.object({ userName: z.string().min(1) })
// Vai ao NOVO e-mail: link de reativação. `email` é o endereço de destino.
export const emailChangeRequestedData = z.object({
  email: z.email(),
  link: z.url({ protocol: /^https?$/ }),
  tokenExpiresAt: isoDate,
})
// Vai ao e-mail ANTIGO: aviso de que uma troca foi solicitada (sem link).
export const emailChangeNoticeData = z.object({ email: z.email(), at: isoDate })

// Só os tipos do próprio notification: o tipo de produto entra pelo
// NotificationTemplateSourceRegistry, com a entrada de catálogo do módulo dono.
export const notificationCatalog: Record<
  (typeof NOTIFICATION_TYPES)[number],
  CatalogEntry
> = {
  access_link_sent: entry({
    category: "transactional",
    channels: ["email"],
    dataSchema: accessLinkSentData,
  }),
  email_verification: entry({
    category: "transactional",
    channels: ["email"],
    dataSchema: emailVerificationData,
  }),
  password_reset_requested: entry({
    category: "security",
    channels: ["email"],
    dataSchema: passwordResetRequestedData,
  }),
  account_lockout: entry({
    category: "security",
    channels: ["email"],
    dataSchema: accountLockoutData,
  }),
  password_changed: entry({
    category: "security",
    channels: ["email", "system"],
    dataSchema: passwordChangedData,
    metadata: (d) => ({ at: d.at }),
    renderInApp: (d) => ({
      title: "Senha alterada",
      body: `Sua senha foi alterada em ${formatDateTime(d.at)}. Se não foi você, fale com um administrador.`,
      actions: [],
    }),
  }),
  device_new_login: entry({
    category: "security",
    channels: ["email", "system"],
    dataSchema: deviceNewLoginData,
    metadata: (d) => ({ deviceLabel: d.deviceLabel, ip: d.ip, at: d.at }),
    renderInApp: (d) => ({
      title: "Novo dispositivo acessou sua conta",
      body: `Login em ${formatDateTime(d.at)} a partir de ${d.deviceLabel}.`,
      actions: [],
    }),
  }),
  device_revoked: entry({
    category: "security",
    channels: ["system"],
    dataSchema: deviceRevokedData,
    metadata: (d) => ({ deviceId: d.deviceId }),
    renderInApp: () => ({
      title: "Dispositivo desconectado",
      body: "Um dispositivo foi desconectado da sua conta e as sessões dele foram encerradas.",
      actions: [],
    }),
  }),
  password_set: entry({
    category: "informational",
    channels: ["system"],
    dataSchema: passwordSetData,
    metadata: (d) => ({ userName: d.userName }),
    renderInApp: (d) => ({
      title: "Conta ativada",
      body: `${d.userName} configurou a senha e ativou a conta.`,
      actions: [],
    }),
  }),
  email_change_requested: entry({
    category: "security",
    channels: ["email"],
    dataSchema: emailChangeRequestedData,
  }),
  email_change_notice: entry({
    category: "security",
    channels: ["email"],
    dataSchema: emailChangeNoticeData,
  }),
}
