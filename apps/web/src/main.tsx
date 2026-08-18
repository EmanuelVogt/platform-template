import { getSessionQueryKey } from "@platform/api-client/hooks/useGetSession"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@/app/styles.css"
import "@/app/config/zod-locale"
import { setupApiClient } from "@/app/config/api-client"
import { AppProviders } from "@/app/providers/app-providers"
import { queryClient } from "@/app/query-client"
import { router } from "@/app/router/router"
import { env } from "@/shared/config/env"
import { ROUTES } from "@/shared/config/routes"
import { persistLastLocation } from "@/shared/lib/last-location"

// URL exata do probe de sessão, derivada do contrato (Kubb) p/ não driftar.
const sessionProbeUrl = getSessionQueryKey()[0].url

setupApiClient({
  baseURL: env.VITE_API_URL,
  onUnauthorized: ({ url }) => {
    // 401 do próprio probe de sessão é esperado (anon) — o guard de rota trata;
    // reagir aqui geraria loop.
    if (url?.split("?")[0] === sessionProbeUrl) return
    // Sessão morta: zera o cache (o que estava lá pertencia à sessão inválida)
    // para o guard ver anon, e manda pro login.
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
