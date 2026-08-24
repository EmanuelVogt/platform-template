import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import ErrorPage from "./error-page"

describe("ErrorPage", () => {
  it("chama reset ao clicar em tentar novamente", async () => {
    const reset = vi.fn()
    render(<ErrorPage error={new Error("falha")} reset={reset} />)

    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" })
    )

    expect(reset).toHaveBeenCalled()
  })
})
