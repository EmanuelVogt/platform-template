import { toSafeProtectedRoute, type RoutePath } from "@/shared/config/routes"

/** Última rota protegida visitada, persistida para restaurar o destino quando o
 *  usuário reabre o app na raiz ou loga de novo. */
const LAST_LOCATION_KEY = "app-last-location"

/** Guarda a rota se for um destino protegido válido. Ignora rotas públicas/auth
 *  (`/entrar`, `/recuperar-senha`…) — só faz sentido restaurar área logada. */
export function persistLastLocation(pathname: string): void {
  const safe = toSafeProtectedRoute(pathname)
  if (safe) localStorage.setItem(LAST_LOCATION_KEY, safe)
}

/** Lê a última rota protegida, validada contra a allowlist (localStorage é
 *  fonte não-confiável). `null` se ausente ou inválida. */
export function readLastLocation(): RoutePath | null {
  return toSafeProtectedRoute(localStorage.getItem(LAST_LOCATION_KEY))
}

/** Apaga a memória quando ela aponta para `pathname`. Rota que falhou não é
 *  destino a restaurar: sem isso, voltar à raiz devolve o usuário à tela que
 *  acabou de quebrar. Memória de outra rota fica intacta. */
export function forgetLastLocation(pathname: string): void {
  const safe = toSafeProtectedRoute(pathname)
  if (safe && readLastLocation() === safe) {
    localStorage.removeItem(LAST_LOCATION_KEY)
  }
}
