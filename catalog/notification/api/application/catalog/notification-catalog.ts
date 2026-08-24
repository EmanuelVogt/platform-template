import { z } from "zod"

import type { NOTIFICATION_TYPES } from "../../api/events/notification-requested.event"

export type NotificationCategory =
  | "security"
  | "transactional"
  | "informational"
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

// Fuso único do entry — evita duplicar o literal entre este catálogo e os
// templates de e-mail (base-template-sources.ts). Vira config quando o kernel
// expuser um fuso do produto (APP_TIMEZONE, T53); hoje reproduz o valor atual.
const NOTIFICATION_TIMEZONE = "America/Sao_Paulo"

// Locale único do entry — mesma razão do fuso acima. O kernel expõe
// DEFAULT_LOCALE via env() (env.ts:66), mas env() é loadEnv() memoizada,
// validação fail-fast de todo o ambiente (env.ts:104-119): chamá-la aqui
// exigiria um DATABASE_URL válido só para formatar uma data. Lê a variável
// bruta com o mesmo default do kernel (não definida OU vazia contam como
// ausente, nunca lança); vira config quando o kernel expuser um acessor de
// locale que não force a validação completa.
function notificationLocale(): string {
  const locale = process.env.DEFAULT_LOCALE
  return locale !== undefined && locale !== "" ? locale : "pt-BR"
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(notificationLocale(), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: NOTIFICATION_TIMEZONE,
  }).format(new Date(iso))
}

export { NOTIFICATION_TIMEZONE, formatDateTime }

/**
 * Tabela única de mensagens do entry notification — assuntos de e-mail e
 * título/corpo in-app. Ponto único de swap por locale; hoje reproduz
 * exatamente as strings anteriores.
 */
const NOTIFICATION_MESSAGES = {
  subjects: {
    access_link_sent: "Configure seu acesso à plataforma",
    email_verification: "Verifique seu e-mail",
    password_reset_requested: "Redefinição de senha",
    account_lockout: "Conta bloqueada temporariamente",
    password_changed: "Sua senha foi alterada",
    device_new_login: "Novo acesso à sua conta",
    email_change_requested: "Confirme seu novo e-mail",
    email_change_notice: "Solicitação de troca de e-mail",
  },
  inApp: {
    passwordChangedTitle: "Senha alterada",
    passwordChangedBody: (at: string) =>
      `Sua senha foi alterada em ${at}. Se não foi você, fale com um administrador.`,
    deviceNewLoginTitle: "Novo dispositivo acessou sua conta",
    deviceNewLoginBody: (at: string, deviceLabel: string) =>
      `Login em ${at} a partir de ${deviceLabel}.`,
    deviceRevokedTitle: "Dispositivo desconectado",
    deviceRevokedBody:
      "Um dispositivo foi desconectado da sua conta e as sessões dele foram encerradas.",
    passwordSetTitle: "Conta ativada",
    passwordSetBody: (userName: string) =>
      `${userName} configurou a senha e ativou a conta.`,
  },
} as const

export { NOTIFICATION_MESSAGES }

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
      title: NOTIFICATION_MESSAGES.inApp.passwordChangedTitle,
      body: NOTIFICATION_MESSAGES.inApp.passwordChangedBody(
        formatDateTime(d.at)
      ),
      actions: [],
    }),
  }),
  device_new_login: entry({
    category: "security",
    channels: ["email", "system"],
    dataSchema: deviceNewLoginData,
    metadata: (d) => ({ deviceLabel: d.deviceLabel, ip: d.ip, at: d.at }),
    renderInApp: (d) => ({
      title: NOTIFICATION_MESSAGES.inApp.deviceNewLoginTitle,
      body: NOTIFICATION_MESSAGES.inApp.deviceNewLoginBody(
        formatDateTime(d.at),
        d.deviceLabel
      ),
      actions: [],
    }),
  }),
  device_revoked: entry({
    category: "security",
    channels: ["system"],
    dataSchema: deviceRevokedData,
    metadata: (d) => ({ deviceId: d.deviceId }),
    renderInApp: () => ({
      title: NOTIFICATION_MESSAGES.inApp.deviceRevokedTitle,
      body: NOTIFICATION_MESSAGES.inApp.deviceRevokedBody,
      actions: [],
    }),
  }),
  password_set: entry({
    category: "informational",
    channels: ["system"],
    dataSchema: passwordSetData,
    metadata: (d) => ({ userName: d.userName }),
    renderInApp: (d) => ({
      title: NOTIFICATION_MESSAGES.inApp.passwordSetTitle,
      body: NOTIFICATION_MESSAGES.inApp.passwordSetBody(d.userName),
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
