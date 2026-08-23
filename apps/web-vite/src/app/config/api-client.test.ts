import { afterEach, describe, expect, it, vi } from "vitest"

import { setupApiClient } from "./api-client"

const { configureClient } = vi.hoisted(() => ({ configureClient: vi.fn() }))
vi.mock("@platform/api-client/client", () => ({ configureClient }))

describe("setupApiClient", () => {
  afterEach(() => vi.clearAllMocks())

  it("configura a baseURL no client", () => {
    setupApiClient({ baseURL: "http://api.local", onUnauthorized: vi.fn() })
    expect(configureClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "http://api.local" })
    )
  })

  it("encaminha onUnauthorized", () => {
    const onUnauthorized = vi.fn()
    setupApiClient({ baseURL: "http://api.local", onUnauthorized })
    const arg = configureClient.mock.calls[0]?.[0] as {
      onUnauthorized: () => void
    }
    arg.onUnauthorized()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})
