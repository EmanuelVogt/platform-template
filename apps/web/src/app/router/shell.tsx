import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  createRoute,
} from "@tanstack/react-router"

import { ErrorPage } from "@/pages/error/ui/error-page"
import { HomePage } from "@/pages/home/ui/home-page"
import { LoginPage } from "@/pages/login/ui/login-page"
import { NotFoundPage } from "@/pages/not-found/ui/not-found-page"
import { ROUTE_ACCESS } from "@/shared/config/route-access"
import { ROUTES } from "@/shared/config/routes"

import { AuthenticatedLayout } from "./authenticated-layout"
import { requireAccess, requireAnon, resolveRootRedirect } from "./guards"

import type { QueryClient } from "@tanstack/react-query"

type RouterContext = { queryClient: QueryClient }

const APP_NAME = "Platform"

export function pageTitle(label?: string): string {
  return label ? `${label} · ${APP_NAME}` : APP_NAME
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  staticData: { access: { kind: "public" } },
  head: () => ({ meta: [{ title: pageTitle() }] }),
  component: RootDocument,
})

function RootDocument() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  )
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.HOME,
  staticData: { access: ROUTE_ACCESS[ROUTES.HOME] },
  beforeLoad: ({ context }) => resolveRootRedirect(context.queryClient),
})

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.LOGIN,
  staticData: { access: ROUTE_ACCESS[ROUTES.LOGIN] },
  beforeLoad: ({ context }) => requireAnon(context.queryClient),
  head: () => ({ meta: [{ title: pageTitle("Entrar") }] }),
  component: LoginPage,
})

// layout pathless autenticado — guard único: sessão + staticData.access da
// rota alvo (pathless declara self, nunca é alvo final)
export const authenticatedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  staticData: { access: { kind: "self" } },
  beforeLoad: ({ context, location, matches }) =>
    requireAccess(context.queryClient, location.pathname, matches),
  component: AuthenticatedLayout,
})

export const inicioRoute = createRoute({
  getParentRoute: () => authenticatedLayoutRoute,
  path: ROUTES.INICIO,
  staticData: { access: ROUTE_ACCESS[ROUTES.INICIO] },
  head: () => ({ meta: [{ title: pageTitle("Início") }] }),
  component: HomePage,
})

export { ErrorPage, NotFoundPage }
