import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ROUTES } from "@/shared/config/routes"

import NotFoundPage from "./not-found-page"

describe("NotFoundPage", () => {
  it("linka para o início", () => {
    render(<NotFoundPage />)

    expect(
      screen.getByRole("link", { name: "Voltar ao início" })
    ).toHaveAttribute("href", ROUTES.HOME)
  })
})
