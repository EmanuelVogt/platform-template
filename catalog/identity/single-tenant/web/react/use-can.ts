import { useQuery } from "@tanstack/react-query"

import { can } from "../core/permissions"
import { sessionQueryOptions } from "./session.queries"

import type { PermissionKey } from "../core/permissions"

export function useCan(): (key: PermissionKey) => boolean {
  const { data } = useQuery(sessionQueryOptions)
  const user = data?.user
  return (key) => (user ? can(user, key) : false)
}
