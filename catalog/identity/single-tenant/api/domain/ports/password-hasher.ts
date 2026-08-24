export interface PasswordHasher {
  /** argon2id + pepper (HMAC-SHA256 com PASSWORD_PEPPER) antes do hash. */
  hash(plain: string): Promise<string>
  verify(plain: string, hash: string): Promise<boolean>
  /** true se o hash usa parâmetros antigos e deve ser re-hasheado no login. */
  needsRehash(hash: string): boolean
}

export const PASSWORD_HASHER: unique symbol = Symbol("PasswordHasher")
