export const NOTIFICATION_TEMPLATE_SOURCES = Symbol("NOTIFICATION_TEMPLATE_SOURCES")

/** O que o renderer e o mailer precisam saber de um template contribuído. */
export interface NotificationTemplateBinding {
  readonly template: string
  readonly templateDir: string
  readonly subject: (data: Record<string, unknown>) => string
}

export interface NotificationTemplateSources {
  require(type: string): NotificationTemplateBinding
  findByTemplate(template: string): NotificationTemplateBinding | undefined
}
