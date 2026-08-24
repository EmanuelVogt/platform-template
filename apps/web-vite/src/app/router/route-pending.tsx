import { WEB_COPY } from "@/shared/config/routes"

/** UI exibida enquanto um `beforeLoad` (resolução de sessão) está pendente. */
export function RoutePending() {
  return <p role="status">{WEB_COPY.loading}</p>
}
