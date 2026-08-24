import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/shared/config/routes"
import {
  persistLastLocation,
  readLastLocation,
} from "@/shared/lib/last-location"

import { ErrorPage } from "./error-page"

const brokenRoute = "/inicio"

const routerState = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: "/inicio",
}))
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerState.navigate,
  useLocation: () => ({ pathname: routerState.pathname }),
}))

describe("ErrorPage", () => {
  beforeEach(() => {
    localStorage.clear()
    routerState.navigate.mockClear()
  })

  it("esquece a rota que falhou para o início não trazer o usuário de volta", () => {
    persistLastLocation(brokenRoute)

    render(<ErrorPage reset={vi.fn()} />)

    expect(readLastLocation()).toBeNull()
  })

  it("leva ao início ao clicar em voltar", async () => {
    render(<ErrorPage reset={vi.fn()} />)

    await userEvent.click(
      screen.getByRole("button", { name: "Voltar ao início" })
    )

    expect(routerState.navigate).toHaveBeenCalledWith({ to: ROUTES.HOME })
  })

  it("tenta renderizar de novo ao clicar em tentar novamente", async () => {
    const reset = vi.fn()
    render(<ErrorPage reset={reset} />)

    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" })
    )

    expect(reset).toHaveBeenCalled()
  })
})
