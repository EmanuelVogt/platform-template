import { join } from "node:path"

import { beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { defineCatalogEntry } from "../../application/catalog/notification-catalog"
import { NotificationTemplateSourceRegistry } from "../../application/templates/notification-template-registry"

import { HandlebarsTemplateRenderer } from "./handlebars-template-renderer"

describe("HandlebarsTemplateRenderer", () => {
  const sources = new NotificationTemplateSourceRegistry()
  const renderer = new HandlebarsTemplateRenderer(sources)
  beforeAll(() => {
    renderer.onModuleInit()
  })

  it("resolve um template base pelo diretório padrão do módulo, com auto-escape", () => {
    const html = renderer.render("access-link", {
      name: "<script>alert(1)</script>",
      link: "https://app.example.com/configurar-senha?token=abc",
    })
    expect(html).toContain("https://app.example.com/configurar-senha?token=abc")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("Platform") // header do layout compartilhado
  })

  it("resolve template registrado por um produto a partir do templateDir da própria fonte", () => {
    sources.register({
      type: "tipo_do_produto" as never,
      catalog: defineCatalogEntry({
        category: "informational",
        channels: ["email"],
        dataSchema: z.object({ name: z.string() }),
      }),
      email: {
        template: "fonte-externa",
        templateDir: join(__dirname, "__fixtures__"),
        subject: () => "assunto da fonte",
      },
    })

    const html = renderer.render("fonte-externa", { name: "Ana" })

    expect(html).toContain("Corpo da fonte externa para Ana")
    expect(html).toContain("Platform")
  })

  it("template desconhecido → throw com mensagem descritiva", () => {
    expect(() => renderer.render("inexistente", {})).toThrow(
      "Template de e-mail desconhecido: inexistente",
    )
  })
})
