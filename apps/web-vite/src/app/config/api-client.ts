import { configureClient } from "@platform/api-client/client"

type SetupApiClientOptions = {
  baseURL: string
  /** Chamado em todo 401, com a `url` que falhou: o caller decide se limpa
   *  cache e redireciona (ignora o 401 esperado do probe de sessão). */
  onUnauthorized: (context: { url?: string }) => void
}

/** Boot único do api-client. O cookie de sessão trafega via `withCredentials`
 *  (já fixo na instância axios do client); sem isso o `__Host-app_session`
 *  nunca chega à API. */
export function setupApiClient({
  baseURL,
  onUnauthorized,
}: SetupApiClientOptions): void {
  configureClient({ baseURL, onUnauthorized })
}
