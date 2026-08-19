import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { sessionKeys } from "@/entities/session/api/session.keys"
import {
  makeTestQueryClient,
  renderWithProviders,
} from "@/shared/test/render-with-providers"

import { HomePage } from "./home-page"

vi.mock("@platform/api-client/hooks/useGetSession", () => ({
  getSession: vi.fn(),
}))

describe("HomePage", () => {
  it("exibe traço quando não há e-mail na sessão", () => {
    renderWithProviders(<HomePage />)
    expect(screen.getByText(/Sessão ativa: —/)).toBeInTheDocument()
  })

  it("exibe o e-mail da sessão corrente", () => {
    const queryClient = makeTestQueryClient()
    queryClient.setQueryData(sessionKeys.current(), {
      user: { email: "ana@example.com" },
    })

    renderWithProviders(<HomePage />, { queryClient })

    expect(screen.getByText(/ana@example\.com/)).toBeInTheDocument()
  })
})
