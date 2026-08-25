import { AppProviders } from "@/_app/providers/app-providers"

import { AccessGuard } from "./access-slot"
import { LastLocationTracker } from "./last-location-tracker"
import { ProductShell } from "./product-shell"

import type { ReactNode } from "react"

// Nome e idioma vêm de `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_LOCALE` — sem
// default, o produto enxerga exatamente o comportamento de hoje (pt-BR,
// "Platform"). Mesmo seam de `VITE_APP_NAME`/`VITE_LOCALE` em
// apps/web-vite/src/app/router/shell.tsx.
function resolveAppName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME ?? "Platform"
}

export function resolveLocale(): string {
  return process.env.NEXT_PUBLIC_LOCALE ?? "pt-BR"
}

const appName = resolveAppName()

export const metadata = {
  // `template` compõe o título de cada página (`metadata.title` de
  // `app/**/page.tsx`) com o nome do app — equivalente ao `pageTitle()` do
  // shell Vite, pela convenção nativa do Next em vez de uma função própria.
  title: { default: appName, template: `%s · ${appName}` },
  // LOC-06 — asset servido de `public/favicon.ico` (Next serve `public/` na
  // raiz automaticamente); a entrada explícita evita depender só do fallback
  // de navegador para `/favicon.ico`.
  icons: { icon: "/favicon.ico" },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={resolveLocale()}>
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
