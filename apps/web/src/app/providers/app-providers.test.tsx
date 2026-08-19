import { QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/router/router", () => ({
  router: {},
}))

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>()
  return {
    ...actual,
    RouterProvider: () => <div>router</div>,
  }
})

vi.mock("@/entities/session/api/session.queries", () => ({
  useSession: () => ({ data: undefined }),
}))

import { AppProviders } from "./app-providers"

describe("AppProviders", () => {
  it("monta query client e router", () => {
    render(<AppProviders />)
    expect(screen.getByText("router")).toBeInTheDocument()
  })
})
