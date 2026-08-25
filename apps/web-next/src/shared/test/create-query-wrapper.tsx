import { QueryClientProvider } from "@tanstack/react-query"

import { makeTestQueryClient } from "./render-with-providers"

import type { QueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"

/**
 * Wrapper de QueryClientProvider para uso direto com `renderHook` — cada
 * chamada usa um QueryClient isolado (ou o informado), sem retry e sem cache
 * compartilhado entre testes.
 */
export function createQueryWrapper(
  queryClient: QueryClient = makeTestQueryClient()
) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}
