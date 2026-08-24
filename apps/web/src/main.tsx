import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@/app/styles.css"
import "@/app/config/zod-locale"
import { setupApiClient } from "@/app/config/api-client"
import { AppProviders } from "@/app/providers/app-providers"
import { queryClient } from "@/app/query-client"
import { router } from "@/app/router/router"
import { isUnauthorizedExempt } from "@/app/router/shell"
import { env } from "@/shared/config/env"
import { ROUTES } from "@/shared/config/routes"
import { persistLastLocation } from "@/shared/lib/last-location"

setupApiClient({
  baseURL: env.VITE_API_URL,
  onUnauthorized: (context) => {
    // Sessão morta: zera o cache (o que estava lá pertencia à sessão inválida)
    // para o guard ver anon, e manda pro login. `registerUnauthorizedExemption`
    // (em `app/router/shell`) isenta o 401 esperado do próprio probe de sessão,
    // que só existe com um módulo de identidade instalado.
    if (isUnauthorizedExempt(context)) return
    queryClient.clear()
    void router.navigate({ to: ROUTES.LOGIN })
  },
})

// Persiste a última rota protegida visitada para restaurar o destino quando o
// usuário reabre o app na raiz ou loga de novo.
router.subscribe("onResolved", ({ toLocation }) => {
  persistLastLocation(toLocation.pathname)
})

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Elemento #root não encontrado no HTML.")
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>
)
