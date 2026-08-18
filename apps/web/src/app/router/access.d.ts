import type { RouteAccess } from "@/shared/config/route-access"

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    access: RouteAccess
  }
}
