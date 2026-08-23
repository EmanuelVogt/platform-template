import { sql } from "drizzle-orm"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createTestDb,
  createTestPool,
  testDatabaseUrl,
} from "../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../test/setup/test-logger"
import { parseEnv } from "../../config/env"
import { DedicatedClientFactory } from "../../infra/database/dedicated-client.factory"
import { TransactionManager } from "../transactional/transaction-manager"

import {
  advisorySessionUnlock,
  MAINTENANCE_LOCK_NAMESPACE,
  tryAdvisorySessionLock,
} from "./advisory-lock"
import { registerMaintenanceJob } from "./maintenance-registry"
import { MaintenanceRuntime } from "./maintenance-runtime"

import type { MaintenanceJobName } from "./maintenance-registry"
import type { Env } from "../../config/env"
import type {
  DrizzleDb,
  DrizzleExecutor,
} from "../../infra/database/drizzle.provider"
import type { PoolClient } from "pg"

function connectionEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    ...process.env,
    DATABASE_URL: testDatabaseUrl(),
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    ...overrides,
  })
}

function makeClientFactory(
  overrides?: Record<string, string>
): DedicatedClientFactory {
  return new DedicatedClientFactory(
    makeTestLogger().loggerFactory.forModule("teste"),
    connectionEnv(overrides)
  )
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  label: string
): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timeout esperando: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

type LockHolder = { pid: number; applicationName: string }

/** O `application_name` distingue "lock no client dedicado" de "lock no pool". */
async function advisoryHolders(
  executor: DrizzleExecutor,
  lockId: number
): Promise<LockHolder[]> {
  const result = await executor.execute<{
    pid: number
    application_name: string
  }>(sql`
    SELECT a.pid, a.application_name
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
     WHERE l.locktype = 'advisory'
       AND l.granted
       AND l.classid = ${MAINTENANCE_LOCK_NAMESPACE}
       AND l.objid = ${lockId}
       AND a.datname = current_database()
  `)
  return result.rows.map((row) => ({
    pid: row.pid,
    applicationName: row.application_name,
  }))
}

function poolSnapshot(pool: Pool): {
  total: number
  idle: number
  waiting: number
} {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  }
}

function outcomeOf(
  runtime: MaintenanceRuntime,
  name: MaintenanceJobName
): string | undefined {
  return runtime.lastRuns().find((r) => r.name === name)?.outcome
}

describe("MaintenanceRuntime (integração)", () => {
  let pool: Pool
  let db: DrizzleDb
  let txm: TransactionManager
  let clients: DedicatedClientFactory
  let runtime: MaintenanceRuntime

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const testLogger = makeTestLogger()
    txm = new TransactionManager(db, testLogger.loggerFactory)
    clients = makeClientFactory()
    runtime = new MaintenanceRuntime(txm, testLogger.ctx, testLogger.loggerFactory, clients)
  })

  afterAll(async () => {
    await clients.onApplicationShutdown()
    await pool.end()
  })

  it("advisory lock serializa runs concorrentes: um roda, o outro pula", async () => {
    const aInside = deferred()
    const releaseA = deferred()
    let ranA = 0
    let ranB = 0

    // A entra no corpo e segura o lock de sessão (client dedicado) até releaseA.
    const pA = runtime.run("outbox.purge", async () => {
      ranA += 1
      aInside.resolve()
      await releaseA.promise
    })

    await aInside.promise
    // B tenta o mesmo lock enquanto A o segura → pg_try_advisory_lock = false.
    await runtime.run("outbox.purge", async () => {
      ranB += 1
    })

    expect(ranB).toBe(0)

    releaseA.resolve()
    await pA
    expect(ranA).toBe(1)

    const last = runtime.lastRuns().find((r) => r.name === "outbox.purge")
    expect(last?.outcome).toBe("completed")
  })

  it("lock solta no fim: run sequencial seguinte pega o lock", async () => {
    let ran = 0
    await runtime.run("idempotency.purge", async () => {
      ran += 1
    })
    await runtime.run("idempotency.purge", async () => {
      ran += 1
    })
    expect(ran).toBe(2)
  })

  it("isolamento: corpo que lança não rejeita o run e marca failed", async () => {
    await expect(
      runtime.run("idempotency.purge", async () => {
        throw new Error("boom")
      })
    ).resolves.toBeUndefined()

    const last = runtime.lastRuns().find((r) => r.name === "idempotency.purge")
    expect(last?.outcome).toBe("failed")
    expect(last?.error).toBe("boom")
  })

  it("dois jobs simultâneos completam, cada um com lock no próprio client", async () => {
    const aInside = deferred()
    const bInside = deferred()
    const release = deferred()

    const pA = runtime.run("outbox.purge", async () => {
      aInside.resolve()
      await release.promise
    })
    const pB = runtime.run("idempotency.purge", async () => {
      bInside.resolve()
      await release.promise
    })
    await Promise.all([aInside.promise, bInside.promise])

    expect(clients.liveCount()).toBe(2)
    const holdersA = await advisoryHolders(db, 1)
    const holdersB = await advisoryHolders(db, 2)
    expect(holdersA).toHaveLength(1)
    expect(holdersB).toHaveLength(1)
    expect(holdersA[0]?.applicationName).toBe("api:job:outbox.purge")
    expect(holdersB[0]?.applicationName).toBe("api:job:idempotency.purge")
    expect(holdersA[0]?.pid).not.toBe(holdersB[0]?.pid)

    release.resolve()
    await Promise.all([pA, pB])

    expect(outcomeOf(runtime, "outbox.purge")).toBe("completed")
    expect(outcomeOf(runtime, "idempotency.purge")).toBe("completed")
    await waitUntil(
      () => clients.liveCount() === 0,
      "clients dedicados dos dois jobs encerrarem"
    )
  })

  it("corpo que lança: failed, com lock solto e client dedicado encerrado", async () => {
    await expect(
      runtime.run("outbox.purge", async () => {
        throw new Error("estouro no corpo")
      })
    ).resolves.toBeUndefined()

    const last = runtime.lastRuns().find((r) => r.name === "outbox.purge")
    expect(last?.outcome).toBe("failed")
    expect(last?.error).toBe("estouro no corpo")
    expect(await advisoryHolders(db, 1)).toEqual([])
    await waitUntil(
      () => clients.liveCount() === 0,
      "client dedicado do job que falhou encerrar"
    )
  })

  it("solta o lock no finally, antes de encerrar o client, mesmo com o corpo lançando", async () => {
    let holdersAtEnd: LockHolder[] = []
    const realCreate = clients.create.bind(clients)
    const spy = vi
      .spyOn(clients, "create")
      .mockImplementation(async (purpose: string) => {
        const client = await realCreate(purpose)
        const realEnd = client.end.bind(client)
        // Só o unlock explícito zera os holders ANTES do end: a queda da sessão
        // também solta o lock, mas aí já é tarde para observar a diferença.
        client.end = async (): Promise<void> => {
          holdersAtEnd = await advisoryHolders(db, 2)
          await realEnd()
        }
        return client
      })

    try {
      let holdersDuring: LockHolder[] = []
      await runtime.run("idempotency.purge", async () => {
        holdersDuring = await advisoryHolders(db, 2)
        throw new Error("estouro antes do unlock")
      })

      expect(outcomeOf(runtime, "idempotency.purge")).toBe("failed")
      expect(holdersDuring).toHaveLength(1)
      expect(holdersAtEnd).toEqual([])
    } finally {
      spy.mockRestore()
    }
  })

  describe("disparo manual (tryStartDetached)", () => {
    // Job sintético e livre de qualquer estado anterior: os dois jobs reais do
    // kernel já rodaram nos blocos acima e carregam outcome no runtime
    // compartilhado, o que invalidaria a checagem de "ainda sem outcome"
    // logo depois do disparo.
    const detachedJob = "detached-probe"
    // Fora dos ids reservados pelo kernel (1, 2, 6): o registry reprova colisão.
    const detachedLockId = 98

    beforeAll(() => {
      registerMaintenanceJob({
        name: detachedJob,
        cron: "0 0 * * *",
        lockId: detachedLockId,
      })
    })

    it("devolve false com o lock tomado e não roda o corpo", async () => {
      const holder = await clients.create("teste:holder-manual")
      try {
        expect(await tryAdvisorySessionLock(holder, 1)).toBe(true)

        let bodyRan = false
        const started = await runtime.tryStartDetached(
          "outbox.purge",
          async () => {
            bodyRan = true
          }
        )

        expect(started).toBe(false)
        expect(bodyRan).toBe(false)
        expect(outcomeOf(runtime, "outbox.purge")).toBe("skipped")
        await waitUntil(
          () => clients.liveCount() === 1,
          "só o holder do teste seguir vivo"
        )
      } finally {
        await advisorySessionUnlock(holder, 1)
        await holder.end()
      }
    })

    it("corpo destacado sobrevive ao retorno e não deixa client vivo no fim", async () => {
      const inside = deferred()
      const release = deferred()

      const started = await runtime.tryStartDetached(detachedJob, async () => {
        inside.resolve()
        await release.promise
      })

      expect(started).toBe(true)
      await inside.promise
      // Corpo ainda rodando depois de tryStartDetached ter devolvido.
      expect(outcomeOf(runtime, detachedJob)).toBeUndefined()
      expect(clients.liveCount()).toBe(1)
      const holders = await advisoryHolders(db, detachedLockId)
      expect(holders[0]?.applicationName).toBe(`api:job:${detachedJob}`)

      release.resolve()
      await waitUntil(
        () => outcomeOf(runtime, detachedJob) === "completed",
        "job destacado completar"
      )
      await waitUntil(
        () => clients.liveCount() === 0,
        "client dedicado do job destacado encerrar"
      )
      expect(await advisoryHolders(db, detachedLockId)).toEqual([])
    })
  })

  describe("corpo sem transação envolvente (default)", () => {
    beforeEach(async () => {
      await pool.query('CREATE TABLE IF NOT EXISTS "_lr_probe" (v int)')
      await pool.query('TRUNCATE "_lr_probe"')
    })
    afterAll(async () => {
      await pool.query('DROP TABLE IF EXISTS "_lr_probe"')
    })

    it("roda o corpo fora de tx envolvente: write persiste apesar de throw posterior", async () => {
      await expect(
        runtime.run("outbox.purge", async () => {
          // O corpo escreve autocommit direto no pool (sem tx envolvente do runtime).
          await pool.query('INSERT INTO "_lr_probe" (v) VALUES (1)')
          throw new Error("estouro depois do write do corpo")
        })
      ).resolves.toBeUndefined() // runGuarded engole o erro e registra failed

      const { rows } = await pool.query('SELECT v FROM "_lr_probe"')
      // Sem tx envolvente: o insert do corpo NÃO sofre rollback.
      expect(rows).toHaveLength(1)
      expect(
        runtime.lastRuns().find((r) => r.name === "outbox.purge")
          ?.outcome
      ).toBe("failed")
    })

    it("é skipped quando o lock session-scoped já está tomado por outra sessão", async () => {
      const holder = await pool.connect()
      try {
        expect(await tryAdvisorySessionLock(holder, 1)).toBe(true)

        let bodyRan = false
        await runtime.run("outbox.purge", async () => {
          bodyRan = true
        })

        expect(bodyRan).toBe(false)
        expect(
          runtime.lastRuns().find((r) => r.name === "outbox.purge")
            ?.outcome
        ).toBe("skipped")
      } finally {
        await advisorySessionUnlock(holder, 1)
        holder.release()
      }
    })

    it("solta o lock no fim: um 2º run consegue rodar o corpo", async () => {
      let count = 0
      await runtime.run("outbox.purge", async () => {
        count += 1
      })
      await runtime.run("outbox.purge", async () => {
        count += 1
      })
      expect(count).toBe(2) // lock foi solto entre os dois runs
    })
  })

  // Nenhum job real declara `atomic: true` hoje: o ramo é exercitado por uma
  // entrada sintética no registro, sem tornar atômico um job de produção.
  describe("corpo com atomic: true", () => {
    const atomicJob = "atomic-probe"
    const atomicLockId = 99

    beforeAll(async () => {
      registerMaintenanceJob({
        name: atomicJob,
        cron: "0 0 * * *",
        lockId: atomicLockId,
        atomic: true,
      })
      await pool.query('CREATE TABLE IF NOT EXISTS "_atomic_probe" (v int)')
    })

    afterAll(async () => {
      await pool.query('DROP TABLE IF EXISTS "_atomic_probe"')
    })

    beforeEach(async () => {
      await pool.query('TRUNCATE "_atomic_probe"')
    })

    it("roda o corpo em transação, com o lock já tomado noutra sessão", async () => {
      let inTransaction = false
      let holders: LockHolder[] = []
      let bodyPid = -1

      await runtime.run(atomicJob, async () => {
        inTransaction = txm.isInTransaction()
        const executor = txm.getExecutor()
        holders = await advisoryHolders(executor, atomicLockId)
        const own = await executor.execute<{ pid: number }>(
          sql`SELECT pg_backend_pid() AS pid`
        )
        bodyPid = own.rows[0]?.pid ?? -1
      })

      expect(inTransaction).toBe(true)
      expect(outcomeOf(runtime, atomicJob)).toBe("completed")
      // Lock vivo durante a tx e numa sessão que NÃO é a da tx: foi tomado
      // antes, no client dedicado, e a tx do pool abriu depois.
      expect(holders).toHaveLength(1)
      expect(holders[0]?.applicationName).toBe("api:job:atomic-probe")
      expect(bodyPid).toBeGreaterThan(0)
      expect(holders[0]?.pid).not.toBe(bodyPid)
    })

    it("corpo atomic que lança sofre rollback e vira failed", async () => {
      await expect(
        runtime.run(atomicJob, async () => {
          await txm
            .getExecutor()
            .execute(sql`INSERT INTO "_atomic_probe" (v) VALUES (7)`)
          throw new Error("estouro dentro da tx atomic")
        })
      ).resolves.toBeUndefined()

      const { rows } = await pool.query('SELECT v FROM "_atomic_probe"')
      expect(rows).toHaveLength(0)
      expect(outcomeOf(runtime, atomicJob)).toBe("failed")
      expect(await advisoryHolders(db, atomicLockId)).toEqual([])
      await waitUntil(
        () => clients.liveCount() === 0,
        "client dedicado do job atomic encerrar"
      )
    })

    it("job atomic que pede a conexão raiz esbarra na guarda e vira failed", async () => {
      await expect(
        runtime.run(atomicJob, async () => {
          txm.outsideTransaction()
        })
      ).resolves.toBeUndefined()

      const last = runtime.lastRuns().find((r) => r.name === atomicJob)
      expect(last?.outcome).toBe("failed")
      expect(last?.error).toContain("com transação ativa")
      expect(await advisoryHolders(db, atomicLockId)).toEqual([])
      await waitUntil(
        () => clients.liveCount() === 0,
        "client dedicado do job atomic encerrar após a guarda"
      )
    })
  })
})

// Pool esfomeado: a única conexão fica cravada num client de teste. Qualquer
// aquisição feita pelo runtime esperaria e estouraria o connectionTimeoutMillis
// (virando `failed`), então `skipped` aqui só é possível sem tocar no pool.
describe("job.skipped não toca o pool de aplicação (integração)", () => {
  let starved: Pool
  let hog: PoolClient
  let clients: DedicatedClientFactory
  let runtime: MaintenanceRuntime

  beforeAll(async () => {
    starved = new Pool({
      connectionString: testDatabaseUrl(),
      max: 1,
      connectionTimeoutMillis: 1000,
    })
    hog = await starved.connect()
    const testLogger = makeTestLogger()
    const txm = new TransactionManager(
      createTestDb(starved),
      testLogger.loggerFactory
    )
    clients = makeClientFactory()
    runtime = new MaintenanceRuntime(txm, testLogger.ctx, testLogger.loggerFactory, clients)
  })

  afterAll(async () => {
    hog.release()
    await clients.onApplicationShutdown()
    await starved.end()
  })

  it("lock já tomado por outra sessão: skipped sem pedir conexão ao pool", async () => {
    const holder = await clients.create("teste:holder-esfomeado")
    try {
      expect(await tryAdvisorySessionLock(holder, 1)).toBe(true)
      const before = poolSnapshot(starved)
      expect(before).toEqual({ total: 1, idle: 0, waiting: 0 })

      let bodyRan = false
      await runtime.run("outbox.purge", async () => {
        bodyRan = true
      })

      expect(bodyRan).toBe(false)
      expect(outcomeOf(runtime, "outbox.purge")).toBe("skipped")
      expect(poolSnapshot(starved)).toEqual(before)
    } finally {
      await advisorySessionUnlock(holder, 1)
      await holder.end()
    }
  })

  it("client dedicado que não conecta: skipped com motivo, sem pedir conexão ao pool", async () => {
    const testLogger = makeTestLogger()
    const foraDoAr = makeClientFactory({
      DATABASE_URL: "postgres://u:p@127.0.0.1:1/indisponivel",
    })
    const cego = new MaintenanceRuntime(
      new TransactionManager(createTestDb(starved), testLogger.loggerFactory),
      testLogger.ctx,
      testLogger.loggerFactory,
      foraDoAr
    )
    const before = poolSnapshot(starved)

    let bodyRan = false
    await cego.run("idempotency.purge", async () => {
      bodyRan = true
    })

    expect(bodyRan).toBe(false)
    const last = cego
      .lastRuns()
      .find((r) => r.name === "idempotency.purge")
    expect(last?.outcome).toBe("skipped")
    expect(last?.error).toEqual(expect.stringMatching(/\S/))
    expect(foraDoAr.liveCount()).toBe(0)
    expect(poolSnapshot(starved)).toEqual(before)
  })
})

