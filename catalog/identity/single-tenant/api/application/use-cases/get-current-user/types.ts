import type { UserView } from "../../views"

export type GetCurrentUserInput = Record<string, never>

export type GetCurrentUserOutput = {
  user: UserView
}
