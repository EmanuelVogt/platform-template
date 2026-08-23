import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { useEffect, type ReactNode } from "react"

import { queryClient } from "@/app/query-client"
import { router } from "@/app/router/router"
import { ROUTES } from "@/shared/config/routes"
import { useAuthStore } from "@/shared/store/auth.store"

/** Escuta logout de outras abas: limpa o cache e manda esta aba para o login. */
function CrossTabLogout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().subscribeCrossTabLogout(() => {
      queryClient.clear()
      void router.navigate({ to: ROUTES.LOGIN })
    })
    return unsubscribe
  }, [])
  return <>{children}</>
}

export function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <CrossTabLogout>
        <RouterProvider router={router} />
      </CrossTabLogout>
    </QueryClientProvider>
  )
}
