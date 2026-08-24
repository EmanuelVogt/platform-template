import { afterEach, describe, expect, it, vi } from "vitest"

import indexHtml from "../../../index.html?raw"

import {
  appLayoutRoute,
  isUnauthorizedExempt,
  pageTitle,
  registerAppGuard,
  registerUnauthorizedExemption,
  resolveLocale,
} from "./shell"

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

describe("registerAppGuard", () => {
  it("instala um beforeLoad em appLayoutRoute que chama o guard registrado", async () => {
    const guard = vi.fn()
    registerAppGuard(guard)
    const queryClient = {}

    await appLayoutRoute.options.beforeLoad?.({
      context: { queryClient },
      location: { pathname: "/inicio" },
    } as never)

    expect(guard).toHaveBeenCalledWith({ queryClient, pathname: "/inicio" })
  })

  it("um novo registro substitui o guard anterior", async () => {
    const first = vi.fn()
    const second = vi.fn()
    registerAppGuard(first)
    registerAppGuard(second)

    await appLayoutRoute.options.beforeLoad?.({
      context: { queryClient: {} },
      location: { pathname: "/inicio" },
    } as never)

    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
  })
})

describe("registerUnauthorizedExemption / isUnauthorizedExempt", () => {
  it("sem registro, nenhum 401 é isento", () => {
    expect(isUnauthorizedExempt({ url: "/qualquer" })).toBe(false)
  })

  it("isenta apenas o 401 que casa o critério registrado", () => {
    registerUnauthorizedExemption((ctx) => ctx.url === "/session/probe")

    expect(isUnauthorizedExempt({ url: "/session/probe" })).toBe(true)
    expect(isUnauthorizedExempt({ url: "/outra" })).toBe(false)
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
