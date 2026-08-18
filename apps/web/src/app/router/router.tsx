import {
  createRouter,
  stringifySearchWith,
  useRouter,
} from "@tanstack/react-router"

import { queryClient } from "@/app/query-client"

import { productRoutes } from "./product-routes"
import { RoutePending } from "./route-pending"
import {
  authenticatedLayoutRoute,
  ErrorPage,
  indexRoute,
  inicioRoute,
  loginRoute,
  NotFoundPage,
  rootRoute,
} from "./shell"

import type { QueryClient } from "@tanstack/react-query"
import type { RouterHistory } from "@tanstack/react-router"

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  authenticatedLayoutRoute.addChildren([inicioRoute, ...productRoutes]),
])

// CSV deliberado p/ arrays (`layers=a,b,c` em vez de JSON): o parseSearch default
// lê tanto o JSON antigo quanto o CSV, então trocar não quebra URLs existentes.
function stringifySearchValue(value: unknown): string {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join(",")
  }
  return JSON.stringify(value)
}

export function createAppRouter(options: {
  queryClient: QueryClient
  history?: RouterHistory
}) {
  return createRouter({
    routeTree,
    context: { queryClient: options.queryClient },
    history: options.history,
    defaultPreload: "intent",
    defaultPendingComponent: RoutePending,
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: function DefaultErrorComponent({ reset }) {
      // `reset` do CatchBoundary só limpa o estado local do erro; sozinho
      // não refaz o loader. `invalidate` é quem marca o match como pendente
      // e dispara o novo carregamento — sem ele "Tentar novamente" reexibe
      // a mesma página de erro. `reset` só roda depois do invalidate assentar:
      // chamá-lo em paralelo remonta a página com o cache antigo (ainda em
      // erro) por uma fração de segundo, disparando uma segunda consulta
      // concorrente com a do loader.
      const router = useRouter()
      return (
        <ErrorPage
          reset={() => {
            void router.invalidate().finally(reset)
          }}
        />
      )
    },
    stringifySearch: stringifySearchWith(stringifySearchValue, JSON.parse),
  })
}

export const router = createAppRouter({ queryClient })
