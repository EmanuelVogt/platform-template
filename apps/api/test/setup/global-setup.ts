import crypto from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { Pool } from "pg"
import { GenericContainer, Wait } from "testcontainers"

import { POSTGRES_URI_ENV, REDIS_URI_ENV } from "./container-uris"
import { ensureDockerRuntimeEnv } from "./docker-runtime"

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
    throw new Error(`Arquivo _journal.json não encontrado em ${migrationsFolder}`)
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
      const hash = crypto
        .createHash("sha256")
        .update(sqlText)
        .digest("hex")

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
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  try {
    for (let worker = 1; worker <= maxWorkers; worker++) {
      await admin.query(`CREATE DATABASE test_w${worker} TEMPLATE "${templateDb}"`)
    }
  } finally {
    await admin.end()
  }
}

/**
 * Sobe Postgres efêmero (testcontainers), aplica as migrations reais e prepara
 * o ambiente do tier que o invocou. As URIs vão pro `process.env` deste
 * processo, que os workers herdam no fork (ver container-uris.ts); os
 * containers ficam no globalThis para o teardown parar.
 *
 * Integration ganha um database por worker (clones do DB migrado) — é o que
 * permite maxWorkers > 1 com suítes que truncam tabelas à vontade.
 *
 * Redis é containerizado só para os e2e: eles bootam o AppModule inteiro, cujo
 * rate-limiter faz fail-open quando o Redis está fora — sem um Redis gerenciado
 * o teste de rate-limit passava por acidente de ambiente. O container parte
 * limpo a cada run, tornando o resultado determinístico. Int não precisa: as
 * duas suítes int de Redis sobem container próprio.
 */
export default async function globalSetup(
  globalConfig: { maxWorkers: number },
  projectConfig: { setupFiles?: string[] }
): Promise<void> {
  ensureDockerRuntimeEnv()
  const pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
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
  // Guarda a referência ANTES de migrar: se migrate() falhar, o teardown ainda
  // consegue parar o container (evita leak de Docker).
  globalThis.__pgContainer = pgContainer

  try {
    const uri = pgContainer.getConnectionUri()
    const pool = new Pool({ connectionString: uri })
    await runMigrations(pool, join(__dirname, "..", "..", "drizzle", "migrations"))
    await pool.end()
    process.env[POSTGRES_URI_ENV] = uri

    const isE2e = (projectConfig.setupFiles ?? []).some((file) =>
      file.includes("e2e-env")
    )
    if (isE2e) {
      const redisContainer = await new GenericContainer("redis:7-alpine")
        .withExposedPorts(6379)
        // GenericContainer não espera o Redis aceitar conexão por padrão.
        .withWaitStrategy(Wait.forListeningPorts())
        .start()
      globalThis.__redisContainer = redisContainer
      process.env[REDIS_URI_ENV] = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
    } else {
      await createWorkerDatabases(
        uri,
        pgContainer.getDatabase(),
        globalConfig.maxWorkers
      )
    }
  } catch (err) {
    await globalThis.__redisContainer?.stop()
    await pgContainer.stop()
    throw err
  }
}
