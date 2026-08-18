import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import Handlebars from "handlebars"

import { NOTIFICATION_TEMPLATE_SOURCES } from "../../domain/ports/notification-template-source.port"

import { emailTheme } from "./email-theme"

import type { NotificationTemplateSources } from "../../domain/ports/notification-template-source.port"
import type { TemplateRenderer } from "../../domain/ports/template-renderer"

const BODIES = [
  "access-link",
  "reset",
  "verify",
  "lockout",
  "password-changed",
  "device-new-login",
  "email-change",
  "email-change-notice",
] as const

/** Compila os .hbs no boot e aplica o layout compartilhado a cada render. */
@Injectable()
export class HandlebarsTemplateRenderer implements TemplateRenderer, OnModuleInit {
  private readonly bodies = new Map<string, HandlebarsTemplateDelegate>()
  private layout!: HandlebarsTemplateDelegate

  constructor(
    @Inject(NOTIFICATION_TEMPLATE_SOURCES)
    private readonly sources: NotificationTemplateSources,
  ) {}

  onModuleInit(): void {
    const dir = join(__dirname, "templates")
    Handlebars.registerPartial(
      "button",
      readFileSync(join(dir, "partials", "button.hbs"), "utf8"),
    )
    this.layout = Handlebars.compile(readFileSync(join(dir, "layout.hbs"), "utf8"))
    for (const name of BODIES) {
      this.bodies.set(name, Handlebars.compile(readFileSync(join(dir, `${name}.hbs`), "utf8")))
    }
  }

  // Os .hbs do produto compilam sob demanda: o módulo dono só se registra no
  // `onModuleInit` dele, que roda depois do `onModuleInit` deste renderer.
  private resolve(template: string): HandlebarsTemplateDelegate | undefined {
    const compiled = this.bodies.get(template)
    if (compiled) return compiled
    const source = this.sources.findByTemplate(template)
    if (!source) return undefined
    const body = Handlebars.compile(
      readFileSync(join(source.templateDir, `${template}.hbs`), "utf8"),
    )
    this.bodies.set(template, body)
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
