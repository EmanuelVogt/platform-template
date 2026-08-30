import { QueryClient } from "@tanstack/react-query"

// Defaults conservadores (ver .agents/skills/frontend-architecture/SKILL.md § Bootstrap, transport and errors).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})
