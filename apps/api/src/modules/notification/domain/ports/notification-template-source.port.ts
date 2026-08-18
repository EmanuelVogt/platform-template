export const NOTIFICATION_TEMPLATE_SOURCES = Symbol("NOTIFICATION_TEMPLATE_SOURCES")

/** O que o `EmailChannel` e o renderer precisam saber pra despachar um tipo por e-mail. */
export interface EmailTemplateBinding {
  readonly template: string
  readonly templateDir?: string
  subject(data: Record<string, unknown>): string
  recipient?(data: Record<string, unknown>): string
  view?(data: Record<string, unknown>): Record<string, unknown>
}

export interface NotificationTemplateSources {
  require(type: string): { email?: EmailTemplateBinding }
  findByTemplate(template: string): EmailTemplateBinding | undefined
}
