import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RoutePending } from "./route-pending"

describe("RoutePending", () => {
  it("exibe status de carregamento acessível", () => {
    render(<RoutePending />)
    expect(screen.getByRole("status")).toHaveTextContent("Carregando…")
  })
})
