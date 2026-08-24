"use client"

import { useEffect, type ReactNode } from "react"

import { queryClient } from "@/_app/config/query-client"
import { ROUTES } from "@/shared/config/routes"
import { useAuthStore } from "@/shared/store/auth.store"

// SPEC_DEVIATION: o Vite navega via `router.navigate` (TanStack Router); aqui não
// há router imperativo disponível neste componente (design § 2 restringe imports
// de next/navigation a usePathname/Link), então o redirecionamento usa navegação
// dura via `window.location.assign`.
// Reason: mantém o mesmo comportamento observável do Vite (limpa cache + vai para
// o login) sem acoplar a um hook de router que não existe neste ponto da árvore.
export function CrossTabLogout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().subscribeCrossTabLogout(() => {
      queryClient.clear()
      window.location.assign(ROUTES.LOGIN)
    })
    return unsubscribe
  }, [])
  return <>{children}</>
}
