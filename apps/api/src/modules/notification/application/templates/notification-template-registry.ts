import { Injectable } from "@nestjs/common"

import type { NotificationType } from "../../api/events/notification-requested.event"
import type {
  NotificationTemplateBinding,
  NotificationTemplateSources,
} from "../../domain/ports/notification-template-source.port"
import type { CatalogEntry } from "../catalog/notification-catalog"

/**
 * Notificação contribuída pelo módulo dono do dado: o `notification` entrega
 * canal, layout e entrega; o produto entrega o corpo, o assunto e a entrada de
 * catálogo do próprio tipo (KPB-07). Reexportado pela facade para os outros
 * módulos; dentro do notification, importa-se daqui.
 */
export interface NotificationTemplateSource extends NotificationTemplateBinding {
  readonly type: NotificationType
  /** Mesmos campos que o catálogo do notification guarda por tipo. */
  readonly catalog: CatalogEntry
}

export class DuplicateNotificationTemplateSourceError extends Error {
  constructor(type: NotificationType) {
    super(`Fonte de template duplicada para o tipo ${type}`)
  }
}

export class NotificationTemplateSourceNotRegisteredError extends Error {
  constructor(type: NotificationType) {
    super(`Nenhuma fonte de template registrada para o tipo ${type}`)
  }
}

// SPEC_DEVIATION: design C-NTPL asks for a `NOTIFICATION_TEMPLATE_SOURCES`
// multi-provider token; this is a registry class instead.
// Reason: Nest has no `multi: true`; the repo precedent for the same inversion
// is `ReportRendererRegistry` (back-arch.md, ADR 0067).
/**
 * Registro explícito em vez de multi-provider: Nest não tem `multi: true`, e o
 * módulo dono se registra no boot (`OnModuleInit`), como o `ReportRendererRegistry`.
 */
@Injectable()
export class NotificationTemplateSourceRegistry implements NotificationTemplateSources {
  private readonly byType = new Map<NotificationType, NotificationTemplateSource>()

  register(source: NotificationTemplateSource): void {
    if (this.byType.has(source.type)) {
      throw new DuplicateNotificationTemplateSourceError(source.type)
    }
    this.byType.set(source.type, source)
  }

  require(type: NotificationType): NotificationTemplateSource {
    const source = this.byType.get(type)
    if (!source) {
      throw new NotificationTemplateSourceNotRegisteredError(type)
    }
    return source
  }

  find(type: NotificationType): NotificationTemplateSource | undefined {
    return this.byType.get(type)
  }

  findByTemplate(template: string): NotificationTemplateSource | undefined {
    for (const source of this.byType.values()) {
      if (source.template === template) return source
    }
    return undefined
  }
}
