import crypto from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { availableParallelism } from "node:os"
import { join } from "node:path"

import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { Pool } from "pg"
import { GenericContainer, Wait } from "testcontainers"

import { ensureDockerRuntimeEnv } from "./docker-runtime"

import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import type { StartedTestContainer } from "testcontainers"
import type { TestProject } from "vitest/node"

declare module "vitest" {
  interface ProvidedContext {
    postgresUri: string
    redisUri: string
  }
}

/**
 * Roda um bloco com um Pool efêmero de setup e devolve a conexão em qualquer
 * saída. Duas garantias das quais o run inteiro depende:
 *
 * - `error` no pool: quando o servidor derruba um client ocioso — parar o
 *   container manda SIGTERM aos backends, que respondem `FATAL 57P01
 *   terminating connection due to administrator command` — o pg-pool reemite o
 *   erro do client como `error` do pool. Sem listener, o Node mata o processo
 *   do runner ("Unhandled 'error' event") e a falha real do setup nunca chega
 *   ao relatório.
 * - `finally`: um pool vazado no caminho de erro deixa um backend vivo até o
 *   container parar — e é essa parada, já dentro do tratamento da falha
 *   original, que dispara o FATAL acima.
 */
async function withSetupPool<T>(
  connectionString: string,
  use: (pool: Pool) => Promise<T>
): Promise<T> {
  const pool = new Pool({ connectionString, max: 1 })
  // Erro de client ocioso não pertence a nenhuma query em voo: o que falhou sai
  // pelo `await` do bloco. Aqui basta não derrubar o processo.
  pool.on("error", () => undefined)
  try {
    return await use(pool)
  } finally {
    // Fechar não pode substituir a causa: com o backend já morto `end()`
    // rejeita, e o erro que importa é o do bloco.
    await pool.end().catch(() => undefined)
  }
}

/**
 * Aplica cada arquivo de migration em sua própria transação (BEGIN/COMMIT).
 * Necessário porque `ALTER TYPE ... ADD VALUE` não pode ser usada na mesma
 * transação em que foi adicionada — o migrator padrão do drizzle usa uma
 * única transação para todas as migrations e falha nesse cenário.
 */
async function runMigrations(
  pool: Pool,
  migrationsFolder: string
): Promise<void> {
  const journalPath = join(migrationsFolder, "meta", "_journal.json")
  if (!existsSync(journalPath)) {
    throw new Error(
      `Arquivo _journal.json não encontrado em ${migrationsFolder}`
    )
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { tag: string; when: number; breakpoints: boolean }[]
  }

  const client = await pool.connect()
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle")
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `)
    const res = await client.query<{ created_at: string }>(
      "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1"
    )
    const lastApplied = res.rows[0]?.created_at
      ? Number(res.rows[0].created_at)
      : null

    for (const entry of journal.entries) {
      if (lastApplied !== null && entry.when <= lastApplied) continue
      const sqlText = readFileSync(
        join(migrationsFolder, `${entry.tag}.sql`),
        "utf8"
      )
      const statements = entry.breakpoints
        ? sqlText.split("--> statement-breakpoint")
        : [sqlText]
      const hash = crypto.createHash("sha256").update(sqlText).digest("hex")

      await client.query("BEGIN")
      try {
        for (const stmt of statements) {
          const trimmed = stmt.trim()
          if (trimmed) await client.query(trimmed)
        }
        await client.query(
          "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
          [hash, entry.when]
        )
        await client.query("COMMIT")
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      }
    }
  } finally {
    client.release()
  }
}

/**
 * Clona o DB migrado em test_w1..test_wN via CREATE DATABASE ... TEMPLATE.
 * Sequencial de propósito: o template não pode ter NENHUMA outra conexão
 * durante a cópia — inclusive outro CREATE concorrente — e por isso o admin
 * conecta no DB "postgres", nunca no template.
 */
async function createWorkerDatabases(
  uri: string,
  templateDb: string,
  maxWorkers: number
): Promise<void> {
  const adminUrl = new URL(uri)
  adminUrl.pathname = "/postgres"
  await withSetupPool(adminUrl.toString(), async (admin) => {
    for (let worker = 1; worker <= maxWorkers; worker++) {
      await admin.query(
        `CREATE DATABASE test_w${worker} TEMPLATE "${templateDb}"`
      )
    }
  })
}

/**
 * Quantos bancos de worker clonar: o maior `maxWorkers` declarado entre o root
 * e os projetos do run — o Vitest reaproveita um único pool de slots
 * `1..maxWorkers` (`VITEST_POOL_ID`), então esse é o número de bancos que
 * podem ser exigidos ao mesmo tempo. Sem nenhum valor declarado, o runner usa
 * a paralelismo da máquina.
 */
function workerDatabaseCount(project: TestProject): number {
  const declared = [
    project.vitest.config.maxWorkers,
    ...project.vitest.projects.map((child) => child.config.maxWorkers),
  ].filter((value): value is number => typeof value === "number")
  const highest = declared.length > 0 ? Math.max(...declared) : 0
  return highest > 0 ? Math.max(1, highest) : availableParallelism()
}

/** Mensagem única para daemon ausente: falha rápida em vez de espera longa. */
function dockerRuntimeError(cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new Error(
    `Docker runtime indisponível (${detail}). Suba o Docker Desktop/Colima — test:int, test:e2e e test:coverage precisam dele; pnpm test não.`
  )
}

/**
 * Sobe Postgres e Redis efêmeros (testcontainers) uma vez por run, aplica as
 * migrations reais, clona um banco por worker e entrega as URIs aos workers
 * pelo canal do runner (`provide`/`inject`, nunca env ou arquivo). O teardown
 * devolvido para os containers no fim do run.
 *
 * Os dois containers sobem sempre, sem detecção de tier: `test:coverage` roda
 * int e e2e no mesmo processo, e o e2e boota o AppModule inteiro — cujo
 * rate-limiter faz fail-open com o Redis fora, deixando o teste de rate-limit
 * passar por acidente de ambiente.
 *
 * Integration ganha um database por worker (clones do DB migrado) — é o que
 * permite maxWorkers > 1 com suítes que truncam tabelas à vontade; o e2e roda
 * serial no banco base.
 */
export default async function setup(
  project: TestProject
): Promise<() => Promise<void>> {
  ensureDockerRuntimeEnv()
  let pgContainer: StartedPostgreSqlContainer
  try {
    pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
      // Banco descartável: dados em tmpfs e durabilidade desligada — crash-safety
      // não vale nada aqui e o fsync domina o custo de truncate/insert.
      .withTmpFs({ "/var/lib/postgresql/data": "rw" })
      .withCommand([
        "postgres",
        "-c",
        "fsync=off",
        "-c",
        "synchronous_commit=off",
        "-c",
        "full_page_writes=off",
      ])
      .start()
  } catch (err) {
    throw dockerRuntimeError(err)
  }

  let redisContainer: StartedTestContainer | undefined
  try {
    const uri = pgContainer.getConnectionUri()
    await withSetupPool(uri, (pool) =>
      runMigrations(pool, join(__dirname, "..", "..", "drizzle", "migrations"))
    )
    await createWorkerDatabases(
      uri,
      pgContainer.getDatabase(),
      workerDatabaseCount(project)
    )

    redisContainer = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      // GenericContainer não espera o Redis aceitar conexão por padrão.
      .withWaitStrategy(Wait.forListeningPorts())
      .start()

    project.provide("postgresUri", uri)
    project.provide(
      "redisUri",
      `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
    )
  } catch (err) {
    // Qualquer falha depois do primeiro start para o que já subiu: sem isto o
    // container fica órfão até o Ryuk recolher. Falhar ao parar não pode
    // substituir a causa — quem diagnostica precisa do erro original.
    await redisContainer?.stop().catch(() => undefined)
    await pgContainer.stop().catch(() => undefined)
    throw err
  }

  const startedRedis = redisContainer
  return async () => {
    await startedRedis.stop()
    await pgContainer.stop()
  }
}
