import type { RouteAccess } from "@/shared/config/route-access.types"

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    access: RouteAccess
  }
}
