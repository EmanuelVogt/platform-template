import { join } from "node:path"

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

  it("renderiza o link de acesso com nome, link e a marca do tema", () => {
    const html = renderer.render("access-link", {
      name: "Ana",
      link: "https://app.example.com/configurar-senha?token=abc",
    })
    expect(html).toContain("Ana")
    expect(html).toContain("https://app.example.com/configurar-senha?token=abc")
    expect(html).toContain("#719149") // primary do tema
    expect(html).toContain("Platform") // header do layout
  })

  it("escapa HTML no nome (auto-escape do Handlebars)", () => {
    const html = renderer.render("access-link", {
      name: "<script>alert(1)</script>",
      link: "https://x.test",
    })
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("aplica o partial do botão (CTA com o link)", () => {
    const html = renderer.render("reset", { link: "https://x.test/reset" })
    expect(html).toContain('href="https://x.test/reset"')
    expect(html).toContain("Redefinir senha")
  })

  it("renderiza password-changed com o instante formatado", () => {
    const html = renderer.render("password-changed", { at: "11/06/2026, 15:30" })
    expect(html).toContain("Senha alterada")
    expect(html).toContain("11/06/2026, 15:30")
  })

  it("device-new-login inclui IP quando presente e omite quando null", () => {
    const withIp = renderer.render("device-new-login", {
      deviceLabel: "Chrome/Linux",
      ip: "10.0.0.1",
      at: "11/06/2026, 15:30",
    })
    expect(withIp).toContain("Chrome/Linux")
    expect(withIp).toContain("IP 10.0.0.1")
    const noIp = renderer.render("device-new-login", {
      deviceLabel: "Chrome/Linux",
      ip: null,
      at: "11/06/2026, 15:30",
    })
    expect(noIp).not.toContain("IP ")
  })

  it("renderiza verify com link de confirmação", () => {
    const html = renderer.render("verify", {
      link: "https://app.example.com/confirmar?token=xyz",
    })
    expect(html).toContain("Confirme seu e-mail")
    expect(html).toContain('href="https://app.example.com/confirmar?token=xyz"')
  })

  it("renderiza lockout sem variáveis dinâmicas", () => {
    const html = renderer.render("lockout", {})
    expect(html).toContain("Conta temporariamente bloqueada")
    expect(html).toContain("Platform")
  })

  it("renderiza email-change com link de confirmação", () => {
    const html = renderer.render("email-change", {
      link: "https://app.example.com/confirmar-email?token=abc",
    })
    expect(html).toContain("Confirme seu novo e-mail")
    expect(html).toContain('href="https://app.example.com/confirmar-email?token=abc"')
  })

  it("renderiza email-change-notice com instante formatado", () => {
    const html = renderer.render("email-change-notice", { at: "16/06/2026, 10:00" })
    expect(html).toContain("Solicitação de troca de e-mail")
    expect(html).toContain("16/06/2026, 10:00")
  })

  it("template desconhecido → throw com mensagem descritiva", () => {
    expect(() => renderer.render("inexistente", {})).toThrow(/desconhecido/)
    expect(() => renderer.render("inexistente", {})).toThrow("Template de e-mail desconhecido: inexistente")
  })

  it("instância não-inicializada lança erro para qualquer template (bodies vazio)", () => {
    const uninit = new HandlebarsTemplateRenderer(new NotificationTemplateSourceRegistry())
    expect(() => uninit.render("access-link", {})).toThrow(/desconhecido/)
  })

  it("resolve template registrado por outro módulo a partir do diretório da fonte", () => {
    sources.register({
      type: "email_verification",
      template: "fonte-externa",
      templateDir: join(__dirname, "__fixtures__"),
      subject: () => "assunto da fonte",
      catalog: defineCatalogEntry({
        category: "informational",
        channels: ["email"],
        dataSchema: z.object({ name: z.string() }),
      }),
    })

    const html = renderer.render("fonte-externa", { name: "Ana" })

    expect(html).toContain("Corpo da fonte externa para Ana")
    expect(html).toContain("Platform")
  })
})
