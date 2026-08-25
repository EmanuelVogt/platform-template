import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppProviders } from "@/_app/providers/app-providers"

import { AccessGuard } from "./access-slot"
import { LastLocationTracker } from "./last-location-tracker"
import { ProductShell } from "./product-shell"
import RootLayout, { metadata, resolveLocale } from "./root-layout"

import type { ReactElement } from "react"

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}))

describe("RootLayout", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("compõe AppProviders, ProductShell e AccessGuard até renderizar os children", () => {
    render(
      <RootLayout>
        <div>conteúdo da página</div>
      </RootLayout>
    )
    expect(screen.getByText("conteúdo da página")).toBeInTheDocument()
  })

  it("aninha html[lang=pt-BR] > body > AppProviders > ProductShell > AccessGuard > LastLocationTracker + children", () => {
    const html = RootLayout({ children: <div>conteúdo</div> }) as ReactElement<{
      lang: string
      children: ReactElement
    }>
    expect(html.type).toBe("html")
    expect(html.props.lang).toBe("pt-BR")

    const body = html.props.children as ReactElement<{ children: ReactElement }>
    expect(body.type).toBe("body")

    const appProviders = body.props.children as ReactElement<{
      children: ReactElement
    }>
    expect(appProviders.type).toBe(AppProviders)

    const productShell = appProviders.props.children as ReactElement<{
      children: ReactElement
    }>
    expect(productShell.type).toBe(ProductShell)

    const accessGuard = productShell.props.children as ReactElement<{
      children: [ReactElement, ReactElement]
    }>
    expect(accessGuard.type).toBe(AccessGuard)
    expect(accessGuard.props.children[0].type).toBe(LastLocationTracker)
  })

  it("exporta metadata.icons apontando para o favicon servido por public/", () => {
    expect(metadata.icons).toEqual({ icon: "/favicon.ico" })
  })

  describe("NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_LOCALE", () => {
    it("sem as variáveis definidas, preserva o comportamento atual", () => {
      expect(metadata.title).toEqual({
        default: "Platform",
        template: "%s · Platform",
      })
      expect(resolveLocale()).toBe("pt-BR")
    })

    it("NEXT_PUBLIC_APP_NAME definido compõe o título default e o template", async () => {
      vi.stubEnv("NEXT_PUBLIC_APP_NAME", "Acme")
      vi.resetModules()
      const fresh = await import("./root-layout")
      expect(fresh.metadata.title).toEqual({
        default: "Acme",
        template: "%s · Acme",
      })
    })

    it("NEXT_PUBLIC_LOCALE definido sobrescreve resolveLocale e o html[lang]", () => {
      vi.stubEnv("NEXT_PUBLIC_LOCALE", "en")
      expect(resolveLocale()).toBe("en")
      const html = RootLayout({
        children: <div>conteúdo</div>,
      }) as ReactElement<{ lang: string }>
      expect(html.props.lang).toBe("en")
    })
  })
})
