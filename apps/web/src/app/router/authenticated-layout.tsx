import { Outlet, useNavigate } from "@tanstack/react-router"

import { useLogout, useSession } from "@/entities/session/api/session.queries"
import { ROUTES } from "@/shared/config/routes"

export function AuthenticatedLayout() {
  const { data } = useSession()
  const logout = useLogout()
  const navigate = useNavigate()

  const onLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        void navigate({ to: ROUTES.LOGIN })
      },
    })
  }

  return (
    <div>
      <header>
        <span>{data?.user.name ?? ""}</span>
        <button type="button" onClick={onLogout} disabled={logout.isPending}>
          {logout.isPending ? "Saindo…" : "Sair"}
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
