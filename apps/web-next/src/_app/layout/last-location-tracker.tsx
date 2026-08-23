"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

import { persistLastLocation } from "@/shared/lib/last-location"

// Persiste a rota protegida atual a cada navegação, para restaurar o destino
// quando o usuário reabre o app na raiz ou loga de novo (equivalente ao
// router.subscribe("onResolved", ...) do Vite, aqui via usePathname).
export function LastLocationTracker(): null {
  const pathname = usePathname()

  useEffect(() => {
    persistLastLocation(pathname)
  }, [pathname])

  return null
}
