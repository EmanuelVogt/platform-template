import { useNavigate } from "@tanstack/react-router"

import { ROUTES, WEB_COPY } from "@/shared/config/routes"

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <section>
      <h1>{WEB_COPY.notFoundTitle}</h1>
      <p>{WEB_COPY.notFoundBody}</p>
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
