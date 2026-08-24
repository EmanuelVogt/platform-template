import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AppLayout } from "./app-layout"

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div>conteúdo</div>,
}))

describe("AppLayout", () => {
  it("renderiza o conteúdo da rota filha dentro do main", () => {
    render(<AppLayout />)

    expect(screen.getByRole("main")).toContainElement(
      screen.getByText("conteúdo")
    )
  })
})
