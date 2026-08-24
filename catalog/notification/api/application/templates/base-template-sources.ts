import {
  NOTIFICATION_MESSAGES,
  formatDateTime,
  notificationCatalog,
} from "../catalog/notification-catalog"

import type { NotificationTemplateSource } from "./notification-template-registry"

export const BASE_TEMPLATE_SOURCES: readonly NotificationTemplateSource[] = [
  {
    type: "access_link_sent",
    catalog: notificationCatalog.access_link_sent,
    email: {
      template: "access-link",
      subject: () => NOTIFICATION_MESSAGES.subjects.access_link_sent,
      view: (data) => ({ name: data.name, link: data.link }),
    },
  },
  {
    type: "email_verification",
    catalog: notificationCatalog.email_verification,
    email: {
      template: "verify",
      subject: () => NOTIFICATION_MESSAGES.subjects.email_verification,
      view: (data) => ({ link: data.link }),
    },
  },
  {
    type: "password_reset_requested",
    catalog: notificationCatalog.password_reset_requested,
    email: {
      template: "reset",
      subject: () => NOTIFICATION_MESSAGES.subjects.password_reset_requested,
      view: (data) => ({ link: data.link }),
    },
  },
  {
    type: "account_lockout",
    catalog: notificationCatalog.account_lockout,
    email: {
      template: "lockout",
      subject: () => NOTIFICATION_MESSAGES.subjects.account_lockout,
      view: () => ({}),
    },
  },
  {
    type: "password_changed",
    catalog: notificationCatalog.password_changed,
    email: {
      template: "password-changed",
      subject: () => NOTIFICATION_MESSAGES.subjects.password_changed,
      view: (data) => ({ at: formatDateTime(data.at as string) }),
    },
  },
  {
    type: "device_new_login",
    catalog: notificationCatalog.device_new_login,
    email: {
      template: "device-new-login",
      subject: () => NOTIFICATION_MESSAGES.subjects.device_new_login,
      view: (data) => ({
        deviceLabel: data.deviceLabel,
        ip: data.ip,
        at: formatDateTime(data.at as string),
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
      subject: () => NOTIFICATION_MESSAGES.subjects.email_change_requested,
      view: (data) => ({ link: data.link }),
    },
  },
  {
    type: "email_change_notice",
    catalog: notificationCatalog.email_change_notice,
    email: {
      template: "email-change-notice",
      subject: () => NOTIFICATION_MESSAGES.subjects.email_change_notice,
      view: (data) => ({ at: formatDateTime(data.at as string) }),
    },
  },
]
