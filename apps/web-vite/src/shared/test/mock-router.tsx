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

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerState.navigate,
  useLocation: () => ({ pathname: routerState.pathname }),
  Outlet: () => routerState.outlet,
}))

/**
 * Configura o mock hoisted de @tanstack/react-router para o teste corrente —
 * troca navigate/pathname/outlet sem duplicar o vi.mock em cada arquivo.
 * Importar este módulo antes de `@tanstack/react-router` no arquivo de
 * teste: o `vi.mock` só intercepta imports resolvidos depois dele.
 */
export function mockRouter(opts: MockRouterOptions = {}) {
  routerState.navigate = opts.navigate ?? vi.fn()
  routerState.pathname = opts.pathname ?? "/"
  routerState.outlet = opts.outlet ?? null
  return routerState
}
