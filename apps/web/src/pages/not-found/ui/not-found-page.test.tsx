import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/shared/config/routes"

import { NotFoundPage } from "./not-found-page"

const routerState = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerState.navigate,
}))

describe("NotFoundPage", () => {
  it("leva ao início ao clicar em voltar", async () => {
    render(<NotFoundPage />)

    await userEvent.click(
      screen.getByRole("button", { name: "Voltar ao início" })
    )

    expect(routerState.navigate).toHaveBeenCalledWith({ to: ROUTES.HOME })
  })
})
