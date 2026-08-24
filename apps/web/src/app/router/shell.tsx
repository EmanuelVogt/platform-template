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
// é o módulo de identidade, que instala o beforeLoad via `registerAppGuard`
// (abaixo) e lê o `staticData.access` da rota folha.
export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  staticData: { access: { kind: "authenticated" } },
  component: AppLayout,
})

export type AppGuard = (ctx: {
  queryClient: QueryClient
  pathname: string
}) => void | Promise<void>

/**
 * Ponto de extensão: quem possui a sessão (ex.: o módulo de identidade) registra
 * aqui o guard da área logada. Sem registro, `appLayoutRoute` sobe sem
 * `beforeLoad` — o comportamento de hoje, o template não exige sessão.
 *
 * `RouteApi.update()` só tipa um subconjunto de opções (mudar `beforeLoad` depois
 * da árvore montada altera a inferência de contexto das rotas filhas), mas em
 * runtime é um `Object.assign` puro sobre `route.options`
 * (`@tanstack/router-core/route.js`) — aqui o shape do contexto não muda, só o
 * momento do registro, daí o cast.
 */
export function registerAppGuard(guard: AppGuard): void {
  const update = appLayoutRoute.update as unknown as (options: {
    beforeLoad: (ctx: {
      context: RouterContext
      location: { pathname: string }
    }) => void | Promise<void>
  }) => unknown

  update({
    beforeLoad: (ctx) =>
      guard({
        queryClient: ctx.context.queryClient,
        pathname: ctx.location.pathname,
      }),
  })
}

export type UnauthorizedContext = { url?: string }

let unauthorizedExemption: ((ctx: UnauthorizedContext) => boolean) | undefined

/**
 * Ponto de extensão: quem possui a sessão (ex.: o módulo de identidade) isenta
 * aqui o 401 esperado do próprio probe de sessão — sem registro, todo 401 limpa
 * o cache e manda pro login (comportamento de hoje, ver `main.tsx`).
 */
export function registerUnauthorizedExemption(
  exemption: (ctx: UnauthorizedContext) => boolean
): void {
  unauthorizedExemption = exemption
}

/** Consultado pelo `onUnauthorized` do api-client (`main.tsx`) — `false` sem
 *  registro, o comportamento de hoje. */
export function isUnauthorizedExempt(ctx: UnauthorizedContext): boolean {
  return unauthorizedExemption?.(ctx) ?? false
}

export const inicioRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: ROUTES.INICIO,
  staticData: { access: { kind: "authenticated" } },
  head: () => ({ meta: [{ title: pageTitle("Início") }] }),
  component: HomePage,
})

export { ErrorPage, NotFoundPage }
