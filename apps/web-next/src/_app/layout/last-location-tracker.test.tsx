import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/shared/config/routes"
import { readLastLocation } from "@/shared/lib/last-location"

import { LastLocationTracker } from "./last-location-tracker"

const mockUsePathname = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}))

describe("LastLocationTracker", () => {
  it("persiste a rota protegida atual ao montar", () => {
    mockUsePathname.mockReturnValue(ROUTES.INICIO)
    render(<LastLocationTracker />)
    expect(readLastLocation()).toBe(ROUTES.INICIO)
  })
})
