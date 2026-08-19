/** Renderiza um template de e-mail (corpo + layout aplicado) em HTML pronto. */
export interface TemplateRenderer {
  render(template: string, data: Record<string, unknown>): string;
}

export const TEMPLATE_RENDERER: unique symbol = Symbol('TemplateRenderer');
