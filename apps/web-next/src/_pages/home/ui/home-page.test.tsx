import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import HomePage from "./home-page"

describe("HomePage", () => {
  it("exibe o título da página inicial", () => {
    render(<HomePage />)
    expect(
      screen.getByRole("heading", { name: "Início" })
    ).toBeInTheDocument()
  })
})
