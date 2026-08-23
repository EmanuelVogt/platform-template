import { useNavigate } from "@tanstack/react-router"

import { ROUTES } from "@/shared/config/routes"

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <section>
      <h1>Página não encontrada</h1>
      <p>
        O endereço que você acessou não existe ou foi movido. Confira o link e
        tente novamente.
      </p>
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
