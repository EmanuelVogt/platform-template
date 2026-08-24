import Link from "next/link"

import { ROUTES } from "@/shared/config/routes"

// SPEC_DEVIATION: tasks.md/design.md prose refer to `ROUTES.home` (lowercase), but
// `shared/config/routes.ts` is copied verbatim from apps/web-vite, whose ROUTES uses
// uppercase keys (HOME/LOGIN/INICIO). Using ROUTES.HOME to match the actual module.
// Reason: "copied verbatim" is the binding rule; the lowercase mentions are a prose slip.

export default function NotFoundPage() {
  return (
    <main>
      <h1>Página não encontrada</h1>
      <p>O endereço que você acessou não existe ou foi movido.</p>
      <Link href={ROUTES.HOME}>Voltar ao início</Link>
    </main>
  )
}
