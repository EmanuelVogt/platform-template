export { defineCatalogEntry } from "../../application/catalog/notification-catalog"
export type {
  CatalogEntry,
  NotificationCategory,
  NotificationChannelKind,
  RenderedInApp,
} from "../../application/catalog/notification-catalog"

export {
  DuplicateNotificationTemplateSourceError,
  NotificationTemplateSourceNotRegisteredError,
  NotificationTemplateSourceRegistry,
} from "../../application/templates/notification-template-registry"
export type { NotificationTemplateSource } from "../../application/templates/notification-template-registry"

export { NOTIFICATION_TEMPLATE_SOURCES } from "../../domain/ports/notification-template-source.port"
export type {
  EmailTemplateBinding,
  NotificationTemplateSources,
} from "../../domain/ports/notification-template-source.port"
