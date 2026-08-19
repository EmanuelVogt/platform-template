import type { CurrentUser } from "./session.types"

/** Fixture do usuário corrente para os testes puros de `web/core`. Fica fora
 *  do `*.test.ts` para ser reutilizada pelas receitas de teste do filho. */
export function makeCurrentUser(over: Partial<CurrentUser> = {}): CurrentUser {
  const base: CurrentUser = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Fulana",
    email: "fulana@example.com",
    emailVerified: true,
    pendingEmail: null,
    accessProfile: "admin",
    permissions: [],
    avatarAttachmentId: null,
    birthDate: null,
  }
  return { ...base, ...over }
}
