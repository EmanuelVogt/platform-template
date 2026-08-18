import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import Handlebars from "handlebars"

import { NOTIFICATION_TEMPLATE_SOURCES } from "../../domain/ports/notification-template-source.port"

import { emailTheme } from "./email-theme"

import type { NotificationTemplateSources } from "../../domain/ports/notification-template-source.port"
import type { TemplateRenderer } from "../../domain/ports/template-renderer"

const DEFAULT_TEMPLATE_DIR = join(__dirname, "templates")

/** Compila os .hbs sob demanda (cache por template) e aplica o layout compartilhado a cada render. */
@Injectable()
export class HandlebarsTemplateRenderer implements TemplateRenderer, OnModuleInit {
  private readonly compiled = new Map<string, HandlebarsTemplateDelegate>()
  private layout!: HandlebarsTemplateDelegate

  constructor(
    @Inject(NOTIFICATION_TEMPLATE_SOURCES)
    private readonly sources: NotificationTemplateSources,
  ) {}

  onModuleInit(): void {
    Handlebars.registerPartial(
      "button",
      readFileSync(join(DEFAULT_TEMPLATE_DIR, "partials", "button.hbs"), "utf8"),
    )
    this.layout = Handlebars.compile(readFileSync(join(DEFAULT_TEMPLATE_DIR, "layout.hbs"), "utf8"))
  }

  private resolve(template: string): HandlebarsTemplateDelegate | undefined {
    const compiled = this.compiled.get(template)
    if (compiled) return compiled
    const binding = this.sources.findByTemplate(template)
    if (!binding) return undefined
    const dir = binding.templateDir ?? DEFAULT_TEMPLATE_DIR
    const body = Handlebars.compile(readFileSync(join(dir, `${template}.hbs`), "utf8"))
    this.compiled.set(template, body)
    return body
  }

  render(template: string, data: Record<string, unknown>): string {
    const body = this.resolve(template)
    if (!body) {
      throw new Error(`Template de e-mail desconhecido: ${template}`)
    }
    const context = { ...data, theme: emailTheme }
    const inner = body(context)
    // {{{body}}} (triple-stache) recebe HTML já renderizado pelo próprio renderer,
    // nunca dado de usuário cru — interpolação de nome/link usa {{ }} (auto-escape).
    return this.layout({ ...context, body: inner })
  }
}
