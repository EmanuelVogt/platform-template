import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { Fragment, useEffect, type ComponentType, type ReactNode } from "react"

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

type AppProvidersProps = {
  /** Slot de extensão: o produto injeta os próprios providers (ex.: contexto de
   *  sessão do módulo de identidade) sem editar este arquivo. Sem registro, o
   *  app sobe como hoje — `Fragment` é passthrough. */
  ProductProviders?: ComponentType<{ children: ReactNode }>
}

export function AppProviders({
  ProductProviders = Fragment,
}: AppProvidersProps = {}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ProductProviders>
        <CrossTabLogout>
          <RouterProvider router={router} />
        </CrossTabLogout>
      </ProductProviders>
    </QueryClientProvider>
  )
}
