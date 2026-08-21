import { getSession } from "@platform/api-client/hooks/useGetSession"
import { useLogin as useLoginMutation } from "@platform/api-client/hooks/useLogin"
import { useLogout as useLogoutMutation } from "@platform/api-client/hooks/useLogout"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"

export const sessionKeys = {
  all: ["session"] as const,
  current: () => [...sessionKeys.all, "current"] as const,
  devices: () => [...sessionKeys.all, "devices"] as const,
}

/** Fonte única do `user`. `retry: false` → 401 é "anon", falha rápido;
 *  `staleTime: Infinity` + `refetchOnWindowFocus: false` → o 401 do próprio
 *  probe não vira loop de refetch. Revalida só por login/logout. */
export const sessionQueryOptions = queryOptions({
  queryKey: sessionKeys.current(),
  queryFn: ({ signal }) => getSession({ signal }),
  retry: false,
  staleTime: Infinity,
  refetchOnWindowFocus: false,
})

export const useSession = () => useQuery(sessionQueryOptions)

/** No sucesso injeta o user no cache — vira authed para o guard sem refetch. */
export const useLogin = () => {
  const queryClient = useQueryClient()
  return useLoginMutation({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(sessionKeys.current(), data)
      },
    },
  })
}

/** Zera o cache — vira anon para o guard, sem resíduo do usuário anterior. A
 *  navegação até o login e o aviso cross-tab são do app (ver README § Parte web). */
export const useLogout = () => {
  const queryClient = useQueryClient()
  return useLogoutMutation({
    mutation: {
      onSuccess: () => {
        queryClient.clear()
      },
    },
  })
}
