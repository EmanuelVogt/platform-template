"use client"

import { usePathname } from "next/navigation"

import { ROUTE_ACCESS } from "@/shared/config/route-access"
import type { RouteAccess } from "@/shared/config/route-access.types"
import type { RoutePath } from "@/shared/config/routes"

import type { ReactNode } from "react"

// Rota ausente de ROUTE_ACCESS cai fechada como autenticada (fail closed,
// mirrors AD-017 default) — nunca pública por omissão.
export function resolveRouteAccess(pathname: string): RouteAccess {
  if (pathname in ROUTE_ACCESS) {
    return ROUTE_ACCESS[pathname as RoutePath]
  }
  return { kind: "authenticated" }
}

// No-op: só lê o acesso declarado da rota atual. A recipe do módulo de
// identidade substitui este arquivo pelo guard real.
export function AccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  resolveRouteAccess(pathname)
  return <>{children}</>
}
