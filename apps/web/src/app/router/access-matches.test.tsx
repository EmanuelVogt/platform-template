import {
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { describe, expect, it } from "vitest"

import type { RouteAccess } from "@/shared/config/route-access"

/**
 * Prova de runtime do mecanismo do guard único (requireAccess): o `matches`
 * recebido no beforeLoad do LAYOUT inclui a rota FOLHA com o staticData dela.
 * Se este teste quebrar numa major do router, o fallback é o accessGuard por
 * rota filha descrito no plano/ADR 0028.
 */
describe("staticData.access no matches do beforeLoad do layout", () => {
  it("a última entrada do matches é a folha, com o access declarado", async () => {
    let seen: RouteAccess | undefined

    const rootRoute = createRootRoute({
      staticData: { access: { kind: "public" } },
      component: Outlet,
    })
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: "authenticated",
      staticData: { access: { kind: "self" } },
      beforeLoad: ({ matches }) => {
        const target = matches[matches.length - 1]
        seen = (target?.staticData as { access?: RouteAccess } | undefined)
          ?.access
      },
      component: Outlet,
    })
    const leafRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: "/administracao/usuarios",
      staticData: {
        access: { kind: "permission", permission: "admin.users.read" },
      },
      component: () => null,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([layoutRoute.addChildren([leafRoute])]),
      history: createMemoryHistory({
        initialEntries: ["/administracao/usuarios"],
      }),
    })
    await router.load()

    expect(seen).toEqual({ kind: "permission", permission: "admin.users.read" })
  })
})
