import {
  ROUTES,
  toSafeProtectedRoute,
  type RoutePath,
} from "@/shared/config/routes"
import { useAuthStore } from "@/shared/store/auth.store"

import { readLastLocation } from "./last-location"

/** Destino de um usuário autenticado. Cadeia: intenção guardada pelo guard →
 *  última rota protegida visitada → início. Todo candidato passa pela allowlist
 *  de rotas protegidas antes de virar destino. */
export function resolveAuthedTarget(): RoutePath {
  const intent = toSafeProtectedRoute(useAuthStore.getState().redirectIntent)
  return intent ?? readLastLocation() ?? ROUTES.INICIO
}
