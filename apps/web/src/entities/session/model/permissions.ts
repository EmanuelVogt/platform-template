import { useQuery } from "@tanstack/react-query"

import type { PermissionKey } from "@/shared/config/route-access"

import { sessionQueryOptions } from "../api/session.options"

import type { CurrentUser } from "./session.types"

export function can(user: CurrentUser, key: PermissionKey): boolean {
  const granted: readonly string[] = user.permissions
  return user.accessProfile === "master" || granted.includes(key)
}

export function useCan(): (key: PermissionKey) => boolean {
  const { data } = useQuery(sessionQueryOptions)
  const user = data?.user
  return (key) => (user ? can(user, key) : false)
}
