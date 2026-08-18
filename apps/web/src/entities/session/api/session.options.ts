import { getSession } from "@platform/api-client/hooks/useGetSession"
import { queryOptions } from "@tanstack/react-query"

import { sessionKeys } from "./session.keys"

/** Opções da query de sessão — fonte única consumida pelo guard de rota
 *  (`ensureQueryData`) e pelo observer (`useSession`). Usa a key do app
 *  (`sessionKeys.current()`) para compartilhar cache com login/logout.
 *
 *  `retry: false` → 401 = anon, falha rápido. `staleTime: Infinity` +
 *  `refetchOnWindowFocus: false` → o 401 do próprio probe não vira loop de
 *  refetch; a sessão revalida só por invalidação explícita (login/logout). */
export const sessionQueryOptions = queryOptions({
  queryKey: sessionKeys.current(),
  queryFn: ({ signal }) => getSession({ signal }),
  retry: false,
  staleTime: Infinity,
  refetchOnWindowFocus: false,
})
