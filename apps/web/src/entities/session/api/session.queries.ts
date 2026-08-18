import { useLogin as useLoginMutation } from "@platform/api-client/hooks/useLogin"
import { useLogout as useLogoutMutation } from "@platform/api-client/hooks/useLogout"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuthStore } from "@/shared/store/auth.store"

import { sessionKeys } from "./session.keys"
import { sessionQueryOptions } from "./session.options"

/** Sessão corrente. Fonte única do `user` (cache do TanStack Query),
 *  compartilhada com o guard de rota via `sessionQueryOptions`. */
export const useSession = () => useQuery(sessionQueryOptions)

/** Login: no sucesso injeta o user no cache da sessão — vira authed para o
 *  guard sem disparar refetch. */
export const useLogin = () => {
  const qc = useQueryClient()
  return useLoginMutation({
    mutation: {
      onSuccess: (data) => {
        qc.setQueryData(sessionKeys.current(), data)
      },
    },
  })
}

/** Logout: avisa as outras abas e zera o cache — vira anon para o guard, sem
 *  resíduo do usuário anterior. A navegação até o login é do caller. */
export const useLogout = () => {
  const qc = useQueryClient()
  return useLogoutMutation({
    mutation: {
      onSuccess: () => {
        useAuthStore.getState().broadcastLogout()
        qc.clear()
      },
    },
  })
}
