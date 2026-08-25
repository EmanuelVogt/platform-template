import { useQuery, useQueryClient } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { createQueryWrapper } from "./create-query-wrapper"
import { makeTestQueryClient } from "./render-with-providers"

describe("createQueryWrapper", () => {
  it("resolve uma query através do QueryClient isolado padrão", async () => {
    const { result } = renderHook(
      () =>
        useQuery({ queryKey: ["valor"], queryFn: () => Promise.resolve("um") }),
      { wrapper: createQueryWrapper() }
    )

    await waitFor(() => expect(result.current.data).toBe("um"))
  })

  it("usa o QueryClient informado em vez de criar um novo", () => {
    const queryClient = makeTestQueryClient()

    const { result } = renderHook(() => useQueryClient(), {
      wrapper: createQueryWrapper(queryClient),
    })

    expect(result.current).toBe(queryClient)
  })
})
