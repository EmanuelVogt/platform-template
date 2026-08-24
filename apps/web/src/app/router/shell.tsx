import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  redirect,
} from "@tanstack/react-router"
import { useEffect } from "react"

import { ErrorPage } from "@/pages/error/ui/error-page"
import { HomePage } from "@/pages/home/ui/home-page"
import { NotFoundPage } from "@/pages/not-found/ui/not-found-page"
import { ROUTES } from "@/shared/config/routes"

import { AppLayout } from "./app-layout"

import type { QueryClient } from "@tanstack/react-query"

type RouterContext = { queryClient: QueryClient }

// Nome e idioma vêm de `VITE_APP_NAME` / `VITE_LOCALE` — sem default, o produto
// enxerga exatamente o comportamento de hoje (pt-BR, "Platform").
function resolveAppName(): string {
  return import.meta.env.VITE_APP_NAME || "Platform"
}

export function resolveLocale(): string {
  return import.meta.env.VITE_LOCALE || "pt-BR"
}

export function pageTitle(label?: string): string {
  const appName = resolveAppName()
  return label ? `${label} · ${appName}` : appName
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  staticData: { access: { kind: "public" } },
  head: () => ({ meta: [{ title: pageTitle() }] }),
  component: RootDocument,
})

function RootDocument() {
  useEffect(() => {
    document.documentElement.lang = resolveLocale()
  }, [])

  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  )
}

// A raiz não tem tela própria: sempre redireciona. O módulo de identidade troca
// este beforeLoad por um que manda anon para o login.
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.HOME,
  staticData: { access: { kind: "public" } },
  beforeLoad: () => {
    throw redirect({ to: ROUTES.INICIO })
  },
})

// Layout pathless da área logada. O template sobe sem guard — quem exige sessão
// é o módulo de identidade, que instala o beforeLoad e lê o `staticData.access`
// da rota folha.
export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  staticData: { access: { kind: "authenticated" } },
  component: AppLayout,
})

export const inicioRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: ROUTES.INICIO,
  staticData: { access: { kind: "authenticated" } },
  head: () => ({ meta: [{ title: pageTitle("Início") }] }),
  component: HomePage,
})

export { ErrorPage, NotFoundPage }
