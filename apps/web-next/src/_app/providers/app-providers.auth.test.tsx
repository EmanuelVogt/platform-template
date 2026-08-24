import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { queryClient } from "@/_app/config/query-client"
import { ROUTES } from "@/shared/config/routes"

import { AppProviders } from "./app-providers"

// jsdom não permite `vi.spyOn(window.location, "assign")` (propriedade não
// redefinível no protótipo); trocamos o `window.location` inteiro por um objeto
// mock nos testes deste arquivo.
describe("AppProviders cross-tab logout", () => {
  const originalLocation = window.location
  const assign = vi.fn()

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: originalLocation.href, assign },
    })
  })

  afterEach(() => {
    queryClient.clear()
    assign.mockClear()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    })
  })

  it("limpa o cache e redireciona para o login ao detectar logout em outra aba", async () => {
    queryClient.setQueryData(["probe"], "valor")

    render(<AppProviders>{null}</AppProviders>)

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "rit-auth-logout",
        newValue: String(Date.now()),
      })
    )

    await waitFor(() => {
      expect(queryClient.getQueryData(["probe"])).toBeUndefined()
      expect(assign).toHaveBeenCalledWith(ROUTES.LOGIN)
    })
  })
})
