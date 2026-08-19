import { notificationCatalog } from "../catalog/notification-catalog"

import type { NotificationTemplateSource } from "./notification-template-registry"

function formatAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso))
}

export const BASE_TEMPLATE_SOURCES: readonly NotificationTemplateSource[] = [
  {
    type: "access_link_sent",
    catalog: notificationCatalog.access_link_sent,
    email: {
      template: "access-link",
      subject: () => "Configure seu acesso à plataforma",
      view: (data) => ({ name: data.name, link: data.link }),
    },
  },
  {
    type: "email_verification",
    catalog: notificationCatalog.email_verification,
    email: {
      template: "verify",
      subject: () => "Verifique seu e-mail",
      view: (data) => ({ link: data.link }),
    },
  },
  {
    type: "password_reset_requested",
    catalog: notificationCatalog.password_reset_requested,
    email: {
      template: "reset",
      subject: () => "Redefinição de senha",
      view: (data) => ({ link: data.link }),
    },
  },
  {
    type: "account_lockout",
    catalog: notificationCatalog.account_lockout,
    email: {
      template: "lockout",
      subject: () => "Conta bloqueada temporariamente",
      view: () => ({}),
    },
  },
  {
    type: "password_changed",
    catalog: notificationCatalog.password_changed,
    email: {
      template: "password-changed",
      subject: () => "Sua senha foi alterada",
      view: (data) => ({ at: formatAt(data.at as string) }),
    },
  },
  {
    type: "device_new_login",
    catalog: notificationCatalog.device_new_login,
    email: {
      template: "device-new-login",
      subject: () => "Novo acesso à sua conta",
      view: (data) => ({
        deviceLabel: data.deviceLabel,
        ip: data.ip,
        at: formatAt(data.at as string),
      }),
    },
  },
  {
    type: "device_revoked",
    catalog: notificationCatalog.device_revoked,
  },
  {
    type: "password_set",
    catalog: notificationCatalog.password_set,
  },
  {
    type: "email_change_requested",
    catalog: notificationCatalog.email_change_requested,
    email: {
      template: "email-change",
      subject: () => "Confirme seu novo e-mail",
      view: (data) => ({ link: data.link }),
    },
  },
  {
    type: "email_change_notice",
    catalog: notificationCatalog.email_change_notice,
    email: {
      template: "email-change-notice",
      subject: () => "Solicitação de troca de e-mail",
      view: (data) => ({ at: formatAt(data.at as string) }),
    },
  },
]
