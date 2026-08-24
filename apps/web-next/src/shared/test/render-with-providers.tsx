import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react"

import type { ReactElement, ReactNode } from "react"

/** QueryClient isolado por render: sem retry e sem cache compartilhado entre testes. */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

/**
 * Renderiza um componente com os providers reais do app, espelhando o
 * AppProviders sem o RouterProvider — componentes que dependem de navegação
 * recebem o `navigate` por prop/mock no próprio teste.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: { queryClient?: QueryClient } & Omit<RenderOptions, "wrapper"> = {}
): RenderResult & { queryClient: QueryClient } {
  const { queryClient = makeTestQueryClient(), ...renderOptions } = options
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...renderOptions }) }
}
