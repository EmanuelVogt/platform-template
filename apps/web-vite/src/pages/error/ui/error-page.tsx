import { useLocation, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { ROUTES, WEB_COPY } from "@/shared/config/routes"
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
      <h1>{WEB_COPY.errorTitle}</h1>
      <p>{WEB_COPY.errorBody}</p>
      <button type="button" onClick={reset}>
        {WEB_COPY.retry}
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate({ to: ROUTES.HOME })
        }}
      >
        {WEB_COPY.backToHome}
      </button>
    </section>
  )
}
