import { QueryClient } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  authenticatedLayoutRoute,
  indexRoute,
  loginRoute,
  rootRoute,
} from "./shell"

const { sessionFetch } = vi.hoisted(() => ({ sessionFetch: vi.fn() }))

vi.mock("@platform/api-client/hooks/useGetSession", () => ({
  getSession: sessionFetch,
}))

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe("shell route loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("indexRoute beforeLoad delega resolveRootRedirect", async () => {
    sessionFetch.mockRejectedValue(new Error("401"))
    const loader = indexRoute.options.beforeLoad
    await expect(
      loader?.({ context: { queryClient: makeClient() } } as never),
    ).rejects.toBeDefined()
  })

  it("loginRoute beforeLoad delega requireAnon", async () => {
    sessionFetch.mockRejectedValue(new Error("401"))
    const loader = loginRoute.options.beforeLoad
    await expect(
      loader?.({ context: { queryClient: makeClient() } } as never),
    ).resolves.toBeUndefined()
  })

  it("authenticatedLayoutRoute beforeLoad delega requireAccess", async () => {
    sessionFetch.mockResolvedValue({
      user: {
        id: "u1",
        permissions: ["produto.exemplo.read"],
        accessProfile: "admin",
      },
    })
    const loader = authenticatedLayoutRoute.options.beforeLoad
    await expect(
      loader?.({
        context: { queryClient: makeClient() },
        location: { pathname: "/inicio" },
        matches: [{ staticData: { access: { kind: "self" } } }],
      } as never),
    ).resolves.toBeUndefined()
  })

  it("rootRoute component está definido", () => {
    expect(rootRoute.options.component).toBeTypeOf("function")
  })
})
