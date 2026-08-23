import type { ReactNode } from "react"

// Único arquivo de layout que o produto edita — slot para branding, fontes e
// cabeçalho do produto. O template sobe como passagem direta.
export function ProductShell({ children }: { children: ReactNode }) {
  return <>{children}</>
}
