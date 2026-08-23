import { Outlet } from "@tanstack/react-router"

/** Casca da área logada do template: sem sessão e sem navegação de produto — o
 *  módulo de identidade e o produto acrescentam o que precisarem. */
export function AppLayout() {
  return (
    <main>
      <Outlet />
    </main>
  )
}
