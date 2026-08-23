import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AppProviders } from "./app-providers"

import type * as ReactRouterModule from "@tanstack/react-router"

vi.mock("@/app/router/router", () => ({
  router: {},
}))

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterModule>()
  return {
    ...actual,
    RouterProvider: () => <div>router</div>,
  }
})

describe("AppProviders", () => {
  it("monta query client e router", () => {
    render(<AppProviders />)
    expect(screen.getByText("router")).toBeInTheDocument()
  })
})
