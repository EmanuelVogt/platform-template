import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/shared/config/routes"

import { AccessGuard, resolveRouteAccess } from "./access-slot"

const mockUsePathname = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}))

describe("resolveRouteAccess", () => {
  it("retorna a entrada declarada para uma rota pública conhecida", () => {
    expect(resolveRouteAccess(ROUTES.HOME)).toEqual({ kind: "public" })
  })

  it("cai fechada como autenticada para uma rota desconhecida", () => {
    expect(resolveRouteAccess("/rota-inexistente")).toEqual({
      kind: "authenticated",
    })
  })
})

describe("AccessGuard", () => {
  it("renderiza os children (no-op) para a rota atual", () => {
    mockUsePathname.mockReturnValue(ROUTES.HOME)
    render(
      <AccessGuard>
        <span>conteúdo protegido</span>
      </AccessGuard>
    )
    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument()
  })
})
