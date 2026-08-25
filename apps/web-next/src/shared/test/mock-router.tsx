import { vi } from "vitest"

import type { ReactNode } from "react"

const routerState = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: "/",
  outlet: null as ReactNode,
}))

export type MockRouterOptions = {
  navigate?: typeof routerState.navigate
  pathname?: string
  outlet?: ReactNode
}

// O App Router não tem um componente Outlet — o layout recebe `children`
// direto do `render` do teste. `outlet` fica só no estado hoisted para a
// assinatura de mockRouter ficar igual à do shell vite.
vi.mock("next/navigation", () => ({
  usePathname: () => routerState.pathname,
  useRouter: () => ({
    push: routerState.navigate,
    replace: routerState.navigate,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}))

/**
 * Configura o mock hoisted de next/navigation para o teste corrente — troca
 * navigate/pathname sem duplicar o vi.mock em cada arquivo. Importar este
 * módulo antes de `next/navigation` no arquivo de teste: o `vi.mock` só
 * intercepta imports resolvidos depois dele.
 */
export function mockRouter(opts: MockRouterOptions = {}) {
  routerState.navigate = opts.navigate ?? vi.fn()
  routerState.pathname = opts.pathname ?? "/"
  routerState.outlet = opts.outlet ?? null
  return routerState
}
