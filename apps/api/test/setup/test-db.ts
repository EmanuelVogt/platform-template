// Plumbing legado: ver `test-logger.ts`. O pool, o db e o reset vêm do harness;
// o que sobra aqui são os truncates nomeados por módulo, que pertencem às
// entradas e saem com elas (GA-9), não ao kernel.
import type { Pool } from "pg"

export {
  createTestDb,
  createTestPool,
  resetDb,
  testDatabaseUrl,
  truncateKernel,
  type TestDb,
} from "../../src/shared/test/int/db"
export { flushRedis, testRedisUrl } from "../../src/shared/test/int/redis"

/**
 * E-mail de seed isolado por suíte. Dois e2e que reusam o mesmo e-mail num
 * Postgres compartilhado colidem se uma suíte não truncar antes da outra;
 * o namespace por suíte remove a dependência de ordem.
 */
export function seedEmail(suite: string, local: string): string {
  return `${suite}.${local}@test.local`
}

/**
 * Limpa todas as tabelas do schema identity entre testes de integração.
 * `auth_events` é append-only (REVOKE DELETE/TRUNCATE) — o TRUNCATE de tabela
 * inteira não dispara o trigger FOR EACH ROW de UPDATE/DELETE, e roda como o
 * superuser do container de teste (que retém TRUNCATE). CASCADE cobre as FKs.
 */
export async function truncateIdentity(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      identity.auth_events,
      identity.verification_tokens,
      identity.permission_templates,
      identity.sessions,
      identity.users
    RESTART IDENTITY CASCADE
  `)
}

/** Limpa as tabelas do schema attachment entre testes de integração. */
export async function truncateAttachment(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      attachment.attachment_access_logs,
      attachment.attachment_acls,
      attachment.attachments
    RESTART IDENTITY CASCADE
  `)
}

/** Limpa a central de tags entre testes (vínculos saem no truncate de cada consumidor). */
export async function truncateTag(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE TABLE tag.tags RESTART IDENTITY CASCADE")
}
