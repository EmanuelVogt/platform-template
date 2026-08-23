"use client"

import { QueryClientProvider } from "@tanstack/react-query"


import { setupApiClient } from "@/_app/config/api-client"
import { queryClient } from "@/_app/config/query-client"
import { env } from "@/shared/config/env"

import { CrossTabLogout } from "./cross-tab-logout"

import type { ReactNode } from "react"

// SPEC_DEVIATION: Next não tem um entry point único como o main.tsx do Vite; o
// boot do api-client roda aqui, no module scope, disparado na primeira importação
// de AppProviders pelo root layout.
// Reason: design § 2 pede "calls setupApiClient once (module scope)" dentro deste
// arquivo.
setupApiClient({
  baseURL: env.apiUrl,
  onUnauthorized: () => {
    queryClient.clear()
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <CrossTabLogout>{children}</CrossTabLogout>
    </QueryClientProvider>
  )
}
