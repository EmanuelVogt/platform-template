import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AppProviders } from "@/_app/providers/app-providers"

import { AccessGuard } from "./access-slot"
import { LastLocationTracker } from "./last-location-tracker"
import { ProductShell } from "./product-shell"
import RootLayout, { metadata } from "./root-layout"

import type { ReactElement } from "react"

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}))

describe("RootLayout", () => {
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

  it("exporta metadata com título", () => {
    expect(metadata.title).toBe("Platform")
  })
})
