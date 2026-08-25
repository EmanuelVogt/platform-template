import { AppProviders } from "@/_app/providers/app-providers"

import { AccessGuard } from "./access-slot"
import { LastLocationTracker } from "./last-location-tracker"
import { ProductShell } from "./product-shell"

import type { ReactNode } from "react"

export const metadata = {
  title: "Platform",
  // LOC-06 — asset servido de `public/favicon.ico` (Next serve `public/` na
  // raiz automaticamente); a entrada explícita evita depender só do fallback
  // de navegador para `/favicon.ico`.
  icons: { icon: "/favicon.ico" },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppProviders>
          <ProductShell>
            <AccessGuard>
              <LastLocationTracker />
              {children}
            </AccessGuard>
          </ProductShell>
        </AppProviders>
      </body>
    </html>
  )
}
