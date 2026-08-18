import { useLogin as useSessionLogin } from "@/entities/session/api/session.queries"

/** Mutation de login. A lógica de status/cache mora na entity; a feature só
 *  re-expõe o hook para o form (status authed + cache de sessão lá dentro). */
export function useLogin() {
  return useSessionLogin()
}
