import { afterEach, describe, expect, it, vi } from "vitest"

import indexHtml from "../../../index.html?raw"

import { pageTitle, resolveLocale } from "./shell"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("pageTitle", () => {
  it("usa só o nome do app sem label", () => {
    expect(pageTitle()).toBe("Platform")
  })

  it("prefixa label com separador", () => {
    expect(pageTitle("Início")).toBe("Início · Platform")
  })
})

describe("configuração de nome e locale", () => {
  it("sem VITE_APP_NAME/VITE_LOCALE definidos, preserva o comportamento atual", () => {
    expect(pageTitle()).toBe("Platform")
    expect(resolveLocale()).toBe("pt-BR")
  })

  it("usa VITE_APP_NAME quando definido", () => {
    vi.stubEnv("VITE_APP_NAME", "Acme")
    expect(pageTitle()).toBe("Acme")
  })

  it("compõe o label com o VITE_APP_NAME configurado", () => {
    vi.stubEnv("VITE_APP_NAME", "Acme")
    expect(pageTitle("Início")).toBe("Início · Acme")
  })

  it("usa VITE_LOCALE quando definido", () => {
    vi.stubEnv("VITE_LOCALE", "en")
    expect(resolveLocale()).toBe("en")
  })
})

describe("apps/web/index.html", () => {
  it("usa placeholders do Vite, não os literais pt-BR/Platform", () => {
    expect(indexHtml).toContain('lang="%VITE_LOCALE%"')
    expect(indexHtml).toContain("<title>%VITE_APP_NAME%</title>")
    expect(indexHtml).not.toContain('lang="pt-BR"')
    expect(indexHtml).not.toContain("<title>Platform</title>")
  })
})
