/**
 * E-mail de seed isolado por suíte. Dois e2e que reusam o mesmo endereço num
 * Postgres compartilhado colidem se uma suíte não truncar antes da outra; o
 * namespace por suíte remove a dependência de ordem.
 */
export function seedEmail(suite: string, local: string): string {
  return `${suite}.${local}@test.local`
}

/** `const mail = emails("auth-login")` → `mail("alice")`. */
export function emails(suite: string): (local: string) => string {
  return (local) => seedEmail(suite, local)
}
