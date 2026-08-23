import { useLocation, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { ROUTES } from "@/shared/config/routes"
import { forgetLastLocation } from "@/shared/lib/last-location"

type Props = {
  reset: () => void
}

export function ErrorPage({ reset }: Props) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // A rota que quebrou fica gravada como última posição (o router já resolveu
  // antes de o render falhar). Sem esquecê-la, "Voltar ao início" traz o
  // usuário de volta para esta mesma tela.
  useEffect(() => {
    forgetLastLocation(pathname)
  }, [pathname])

  return (
    <section>
      <h1>Algo deu errado</h1>
      <p>
        Não foi possível carregar esta página. Tente novamente; se o problema
        continuar, volte ao início.
      </p>
      <button type="button" onClick={reset}>
        Tentar novamente
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate({ to: ROUTES.HOME })
        }}
      >
        Voltar ao início
      </button>
    </section>
  )
}
