import { performance } from "node:perf_hooks"

import { Pool } from "pg"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { parseEnv } from "../../config/env"
import { NestedAcquisitionError } from "../../kernel/errors/nested-acquisition.error"
import { PoolSaturatedError } from "../../kernel/errors/pool-saturated.error"
import { processedEvents } from "../../kernel/outbox/processed-events.table"
import { TransactionManager } from "../../kernel/transactional/transaction-manager"
import {
  createTestDb,
  testDatabaseUrl,
  truncateKernel,
} from "../../test/int/db"
import { makeTestLogger } from "../../test/int/logger"

import { ApplicationPool } from "./application-pool"
import { poolConfig } from "./connection-config"

import type { DrizzleDb } from "./drizzle.provider"
import type { Env } from "../../config/env"
import type { AppLogger } from "../../kernel/logging/logger.factory"
import type { PoolClient } from "pg"

describe("ApplicationPool (integração)", () => {
  let pool: ApplicationPool
  let db: DrizzleDb
  let txm: TransactionManager

  beforeAll(() => {
    pool = new ApplicationPool(
      {
        connectionString: testDatabaseUrl(),
        max: 5,
        connectionTimeoutMillis: 5000,
      },
      { maxWaiting: 20, acquireWarnMs: 500 }
    )
    db = createTestDb(pool)
    txm = new TransactionManager(db, makeTestLogger().loggerFactory)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await truncateKernel(pool)
  })

  function insert(eventId: string): Promise<unknown> {
    return txm
      .getExecutor()
      .insert(processedEvents)
      .values({ eventId, consumer: "c" })
  }

  async function ids(): Promise<string[]> {
    const rows = await db.select().from(processedEvents)
    return rows.map((r) => r.eventId).sort()
  }

  describe("é um pool de verdade", () => {
    it("mantém instanceof Pool (o drizzle decide o modo por isso)", () => {
      expect(pool).toBeInstanceOf(Pool)
    })
  })

  describe("fora de transação a aquisição prossegue", () => {
    it("pool.query executa", async () => {
      const result = await pool.query<{ um: number }>("SELECT 1 AS um")
      expect(result.rows.at(0)?.um).toBe(1)
    })

    it("pool.connect entrega um client utilizável", async () => {
      const client = await pool.connect()
      try {
        const result = await client.query<{ dois: number }>("SELECT 2 AS dois")
        expect(result.rows.at(0)?.dois).toBe(2)
      } finally {
        client.release()
      }
    })
  })

  describe("dentro de transação a aquisição é recusada", () => {
    it("pool.query rejeita a promise em vez de lançar síncrono", async () => {
      await txm.run(async () => {
        let pending: Promise<unknown> | undefined
        const acquire = (): void => {
          pending = pool.query("SELECT 1")
        }

        expect(acquire).not.toThrow()
        await expect(pending).rejects.toThrow(NestedAcquisitionError)
      })
    })

    it("pool.query dentro do run derruba a transação e não persiste nada", async () => {
      await expect(
        txm.run(async () => {
          await insert("perdido")
          await pool.query("SELECT 1")
        })
      ).rejects.toThrow(NestedAcquisitionError)
      expect(await ids()).toEqual([])
    })

    it("pool.connect rejeita a promise em vez de lançar síncrono", async () => {
      await txm.run(async () => {
        let pending: Promise<PoolClient> | undefined
        const acquire = (): void => {
          pending = pool.connect()
        }

        expect(acquire).not.toThrow()
        await expect(pending).rejects.toThrow(NestedAcquisitionError)
      })
    })

    it("pool.connect derruba a transação quando a recusa não é tratada", async () => {
      await expect(
        txm.run(async () => {
          await pool.connect()
        })
      ).rejects.toThrow(NestedAcquisitionError)
    })

    it("a mensagem aponta as saídas suportadas", async () => {
      await txm.run(async () => {
        await expect(pool.query("SELECT 1")).rejects.toThrow(
          /getExecutor\(\).*requires_new.*onCommit/s
        )
      })
    })
  })

  describe("caminhos legítimos continuam passando", () => {
    it("a abertura da transação de topo passa pela guarda", async () => {
      await txm.run(async () => {
        await insert("topo")
      })
      expect(await ids()).toEqual(["topo"])
    })

    it("onCommit gravando na raiz passa (o ALS já esvaziou)", async () => {
      await txm.run(async () => {
        const insertAfterCommit = async (): Promise<void> => {
          await db
            .insert(processedEvents)
            .values({ eventId: "pos-commit", consumer: "c" })
        }

        await insert("na-tx")
        txm.onCommit(insertAfterCommit)
      })
      expect(await ids()).toEqual(["na-tx", "pos-commit"])
    })

    it("requires_new segue em SAVEPOINT sem pedir conexão ao pool", async () => {
      await txm.run(async () => {
        const insertChild = async (): Promise<void> => {
          await insert("filho")
        }

        await insert("pai")
        await txm.run(insertChild, { propagation: "requires_new" })
      })
      expect(await ids()).toEqual(["filho", "pai"])
    })

    it("rollback do SAVEPOINT não derruba o pai (mesma conexão)", async () => {
      await txm.run(async () => {
        const insertThenFail = async (): Promise<void> => {
          await insert("descartado")
          throw new Error("falha interna")
        }

        await insert("sobrevive")
        await expect(
          txm.run(insertThenFail, { propagation: "requires_new" })
        ).rejects.toThrow("falha interna")
      })
      expect(await ids()).toEqual(["sobrevive"])
    })
  })

  describe("teto da fila", () => {
    function limitedPool(): ApplicationPool {
      return new ApplicationPool(
        {
          connectionString: testDatabaseUrl(),
          max: 2,
          connectionTimeoutMillis: 5000,
        },
        { maxWaiting: 1, acquireWarnMs: 500 }
      )
    }

    it("recusa na hora a aquisição que estouraria a fila", async () => {
      const limited = limitedPool()
      let first: PoolClient | undefined
      let second: PoolClient | undefined
      let queued: Promise<PoolClient> | undefined
      try {
        first = await limited.connect()
        second = await limited.connect()
        queued = limited.connect()
        expect(limited.waitingCount).toBe(1)

        const startedAt = performance.now()
        let refused: Promise<PoolClient> | undefined
        expect(() => {
          refused = limited.connect()
        }).not.toThrow()
        await expect(refused).rejects.toThrow(PoolSaturatedError)
        expect(performance.now() - startedAt).toBeLessThan(100)
      } finally {
        first?.release()
        second?.release()
        ;(await queued)?.release()
        await limited.end()
      }
    })

    it("pool.query no teto rejeita com o mesmo erro (forma callback)", async () => {
      const limited = limitedPool()
      let first: PoolClient | undefined
      let second: PoolClient | undefined
      let queued: Promise<PoolClient> | undefined
      try {
        first = await limited.connect()
        second = await limited.connect()
        queued = limited.connect()
        expect(limited.waitingCount).toBe(1)

        await expect(limited.query("SELECT 1")).rejects.toThrow(
          PoolSaturatedError
        )
      } finally {
        first?.release()
        second?.release()
        ;(await queued)?.release()
        await limited.end()
      }
    })

    // Abertura de tx de topo não tem prioridade sobre requisição comum: no teto
    // da fila ela recebe o mesmo 503, na hora, e o corpo nunca chega a rodar.
    it("tx de topo aberta no teto da fila falha com o mesmo 503, sem rodar o corpo", async () => {
      const limited = limitedPool()
      const limitedTxm = new TransactionManager(
        createTestDb(limited),
        makeTestLogger().loggerFactory
      )
      let first: PoolClient | undefined
      let second: PoolClient | undefined
      let queued: Promise<PoolClient> | undefined
      try {
        first = await limited.connect()
        second = await limited.connect()
        queued = limited.connect()
        expect(limited.waitingCount).toBe(1)

        let bodyRan = false
        const startedAt = performance.now()
        const err = await limitedTxm
          .run(async () => {
            bodyRan = true
          })
          .catch((e: unknown) => e)

        expect(err).toBeInstanceOf(PoolSaturatedError)
        expect(err).not.toBeInstanceOf(NestedAcquisitionError)
        expect(bodyRan).toBe(false)
        expect(performance.now() - startedAt).toBeLessThan(100)
      } finally {
        first?.release()
        second?.release()
        ;(await queued)?.release()
        await limited.end()
      }
    })

    it("a mensagem da saturação não vaza connection string, SQL nem contadores", () => {
      const err = new PoolSaturatedError()
      expect(err.message).toBe("Serviço temporariamente indisponível")
      expect(err.status).toBe(503)
      expect(err.retryAfterSeconds).toBe(1)
      for (const leak of ["postgres://", "SELECT", "waiting", "timeout"]) {
        expect(err.message).not.toContain(leak)
      }
    })
  })

  describe("timeout de aquisição (T21)", () => {
    /**
     * `max: 1` com o único client retido: quem chega depois espera na fila e
     * estoura `connectionTimeoutMillis` — o timeout de aquisição de verdade,
     * que é o caso a embrulhar em 503 (falha de conexão real fica de fora).
     * `connectionTimeoutMillis` governa as DUAS pontas do pg-pool: a conexão
     * física real que abre `held` (varia com a carga do host/Docker) e o
     * temporizador puro que rejeita quem fica na fila. Um valor apertado (ex.:
     * 150ms) corre risco de derrubar a própria conexão real sob host lento —
     * flake por velocidade do host, não pela saturação que o teste quer
     * provar. Uma folga confortável tira a corrida: a conexão real sempre
     * cabe, e o temporizador da fila segue determinístico (não é I/O).
     */
    function saturatedPool(logger: AppLogger): ApplicationPool {
      return new ApplicationPool(
        {
          connectionString: testDatabaseUrl(),
          max: 1,
          connectionTimeoutMillis: 2000,
        },
        { maxWaiting: 20, acquireWarnMs: 5000, logger }
      )
    }

    function poolLogger(): AppLogger {
      return makeTestLogger().loggerFactory.forModule("ApplicationPool")
    }

    it("as duas formas de connect saem com PoolSaturatedError e o log traz o pool do instante", async () => {
      const logger = poolLogger()
      const warn = vi.spyOn(logger, "warn")
      const pending = saturatedPool(logger)
      const held = await pending.connect()
      try {
        const first = pending.connect().catch((err: unknown) => err)
        const second = pending.query("SELECT 1").catch((err: unknown) => err)

        expect(await first).toBeInstanceOf(PoolSaturatedError)
        expect(await second).toBeInstanceOf(PoolSaturatedError)

        const snapshots = warn.mock.calls
          .filter(([msg]) => msg === "db.pool_acquire_timeout")
          .map(([, bindings]) => bindings)
        expect(snapshots.at(0)).toEqual({
          totalCount: 1,
          idleCount: 0,
          waitingCount: 1,
        })
        // O retrato é do instante: aqui a fila já esvaziou, então waitingCount 1
        // só pode ter sido lido dentro do callback do pg.
        expect(pending.waitingCount).toBe(0)
      } finally {
        held.release()
        await pending.end()
      }
    })

    it("falha de conexão de verdade não vira saturação", async () => {
      const url = new URL(testDatabaseUrl())
      url.pathname = "/banco_que_nao_existe"
      const broken = new ApplicationPool(
        { connectionString: url.toString(), connectionTimeoutMillis: 5000 },
        { maxWaiting: 20, acquireWarnMs: 500 }
      )
      try {
        const failure = await broken.connect().catch((err: unknown) => err)
        expect(failure).toBeInstanceOf(Error)
        expect(failure).not.toBeInstanceOf(PoolSaturatedError)
        expect((failure as { code?: string }).code).toBe("3D000")
      } finally {
        await broken.end()
      }
    })
  })

  describe("saturação observável (T22)", () => {
    /**
     * `acquireWarnMs: 0` põe o limiar abaixo de qualquer espera real, então o
     * log não depende de dormir no teste; quem segura o único client é um
     * `pg_sleep` no servidor, e não um timer local.
     */
    function warnOnEveryAcquire(logger: AppLogger): ApplicationPool {
      return new ApplicationPool(
        {
          connectionString: testDatabaseUrl(),
          max: 1,
          connectionTimeoutMillis: 5000,
        },
        { maxWaiting: 20, acquireWarnMs: 0, logger }
      )
    }

    it("a espera na fila loga db.pool_acquire_slow com o pool do instante", async () => {
      const logger = makeTestLogger().loggerFactory.forModule("ApplicationPool")
      const warn = vi.spyOn(logger, "warn")
      const saturated = warnOnEveryAcquire(logger)
      const held = await saturated.connect()
      try {
        const firstQueued = saturated.connect()
        const secondQueued = saturated.connect()
        expect(saturated.waitingCount).toBe(2)

        warn.mockClear()
        await held.query("SELECT pg_sleep(0.2)")
        held.release()

        const first = await firstQueued
        first.release()
        const second = await secondQueued
        second.release()

        const snapshots = warn.mock.calls
          .filter(([msg]) => msg === "db.pool_acquire_slow")
          .map(([, bindings]) => bindings)
        expect(snapshots).toEqual([
          {
            waitedMs: expect.any(Number),
            totalCount: 1,
            idleCount: 0,
            waitingCount: 1,
          },
          {
            waitedMs: expect.any(Number),
            totalCount: 1,
            idleCount: 0,
            waitingCount: 0,
          },
        ])
        // Piso bem abaixo do pg_sleep de propósito: o que importa é que
        // `waitedMs` é a espera real, não zero nem lixo. Colar o piso na
        // duração do sleep põe o relógio do JS para competir com o do Postgres
        // e o caso reprova por 1 ms de arredondamento.
        expect(snapshots.at(0)?.waitedMs).toBeGreaterThanOrEqual(50)
        // O retrato é do instante: aqui a fila já esvaziou e há client ocioso,
        // então `waitingCount: 1` com `idleCount: 0` só pode ter sido lido
        // dentro do callback do pg.
        expect(saturated.waitingCount).toBe(0)
        expect(saturated.idleCount).toBe(1)
      } finally {
        await saturated.end()
      }
    })

    it("as duas formas de connect entregam o tempo de espera ao observador", async () => {
      const measured = new ApplicationPool(
        {
          connectionString: testDatabaseUrl(),
          max: 2,
          connectionTimeoutMillis: 5000,
        },
        { maxWaiting: 20, acquireWarnMs: 500 }
      )
      const waits: number[] = []
      measured.setAcquireObserver((waitedMs) => waits.push(waitedMs))
      try {
        const client = await measured.connect()
        client.release()
        await measured.query("SELECT 1")

        expect(waits).toHaveLength(2)
        expect(waits.every((ms) => ms >= 0)).toBe(true)
      } finally {
        await measured.end()
      }
    })

    it("observador que lança não derruba a aquisição", async () => {
      const logger = makeTestLogger().loggerFactory.forModule("ApplicationPool")
      const warn = vi.spyOn(logger, "warn")
      const measured = new ApplicationPool(
        {
          connectionString: testDatabaseUrl(),
          max: 2,
          connectionTimeoutMillis: 5000,
        },
        { maxWaiting: 20, acquireWarnMs: 500, logger }
      )
      measured.setAcquireObserver(() => {
        throw new Error("histograma quebrado")
      })
      try {
        const result = await measured.query<{ um: number }>("SELECT 1 AS um")
        expect(result.rows.at(0)?.um).toBe(1)
        expect(warn).toHaveBeenCalledWith("db.pool_metrics_failed", {
          err: "histograma quebrado",
        })
      } finally {
        await measured.end()
      }
    })
  })

  describe("idle_in_transaction_session_timeout (T20)", () => {
    /**
     * `env()` real é memoizado e exige WEB_ORIGIN/REDIS_URL só para caber no
     * Zod — o override de DATABASE_IDLE_IN_TX_TIMEOUT_MS é o que interessa,
     * roteado por `poolConfig()` (mesma função que o boot usa), não escrito à
     * mão na chave crua do driver.
     */
    function envWithIdleInTxTimeout(ms: number): Env {
      return parseEnv({
        ...process.env,
        DATABASE_URL: testDatabaseUrl(),
        WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
        REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
        DATABASE_IDLE_IN_TX_TIMEOUT_MS: String(ms),
      })
    }

    function poolWithIdleInTxTimeout(ms: number): ApplicationPool {
      return new ApplicationPool(
        { ...poolConfig(envWithIdleInTxTimeout(ms)), max: 2 },
        { maxWaiting: 20, acquireWarnMs: 500 }
      )
    }

    /**
     * O Postgres derruba a sessão ociosa por conta própria (não espera a
     * próxima query): o driver recebe isso como evento `error` assíncrono no
     * client — por isso o teste espera o evento em vez de dormir um tempo
     * fixo e torcer para o timeout já ter passado.
     */
    function waitClientError(client: PoolClient): Promise<Error> {
      return new Promise((resolve) => client.once("error", resolve))
    }

    it("transação ociosa além do teto é encerrada pelo Postgres, e a próxima query falha alto", async () => {
      const shortIdlePool = poolWithIdleInTxTimeout(200)
      try {
        const client = await shortIdlePool.connect()
        try {
          const killed = waitClientError(client)
          await client.query("BEGIN")
          const err = await killed
          expect(err.message).toMatch(/idle-in-transaction timeout/)
          expect((err as { code?: string }).code).toBe("25P03")

          await expect(client.query("SELECT 1")).rejects.toThrow()
        } finally {
          client.release()
        }
      } finally {
        await shortIdlePool.end()
      }
    })

    it("o client morto pela sessão ociosa não volta íntegro ao pool", async () => {
      const shortIdlePool = poolWithIdleInTxTimeout(200)
      try {
        const client = await shortIdlePool.connect()
        expect(shortIdlePool.totalCount).toBe(1)

        const killed = waitClientError(client)
        await client.query("BEGIN")
        await killed
        await expect(client.query("SELECT 1")).rejects.toThrow()

        client.release()
        expect(shortIdlePool.totalCount).toBe(0)
      } finally {
        await shortIdlePool.end()
      }
    })

    it("sem idle_in_transaction_session_timeout a transação ociosa não é encerrada (controle)", async () => {
      const noTimeoutPool = poolWithIdleInTxTimeout(0)
      try {
        const client = await noTimeoutPool.connect()
        try {
          await client.query("BEGIN")
          await new Promise((resolve) => setTimeout(resolve, 600))
          const result = await client.query<{ um: number }>("SELECT 1 AS um")
          expect(result.rows.at(0)?.um).toBe(1)
          await client.query("COMMIT")
        } finally {
          client.release()
        }
      } finally {
        await noTimeoutPool.end()
      }
    })
  })
})
