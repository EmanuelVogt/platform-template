import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { createTestPool, testDatabaseUrl } from "../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../test/setup/test-logger"
import { parseEnv } from "../../config/env"

import { DedicatedClientFactory } from "./dedicated-client.factory"
import { ManagedDedicatedClient } from "./managed-dedicated-client"

import type { ApplicationPool } from "./application-pool"
import type { Env } from "../../config/env"
import type { Client } from "pg"

function connectionEnv(): Env {
  return parseEnv({
    ...process.env,
    DATABASE_URL: testDatabaseUrl(),
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  })
}

async function backendPid(client: Client): Promise<number> {
  const result = await client.query<{ pid: number }>(
    "SELECT pg_backend_pid() AS pid"
  )
  const pid = result.rows.at(0)?.pid
  if (pid === undefined) throw new Error("sem pid de backend")
  return pid
}

/** `events.once` rejeita se vier 'error' antes — e a queda server-side manda os dois. */
function endOf(client: Client): Promise<void> {
  return new Promise((resolve) => {
    client.once("end", () => {
      resolve()
    })
  })
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

describe("clients dedicados (integração)", () => {
  let pool: ApplicationPool
  let factory: DedicatedClientFactory

  beforeAll(() => {
    pool = createTestPool()
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(() => {
    factory = new DedicatedClientFactory(
      makeTestLogger().loggerFactory.forModule("teste"),
      connectionEnv()
    )
  })

  afterEach(async () => {
    await factory.onApplicationShutdown()
  })

  async function liveSessions(pids: number[]): Promise<number> {
    const result = await pool.query<{ total: string }>(
      "SELECT count(*) AS total FROM pg_stat_activity WHERE pid = ANY($1::int[])",
      [pids]
    )
    return Number(result.rows.at(0)?.total ?? "0")
  }

  describe("DedicatedClientFactory", () => {
    it("conecta com application_name identificando o propósito", async () => {
      const client = await factory.create("outbox-listen")
      const result = await client.query<{ application_name: string }>(
        "SELECT application_name FROM pg_stat_activity WHERE pid = pg_backend_pid()"
      )
      expect(result.rows.at(0)?.application_name).toBe("api:outbox-listen")
    })

    it("outra sessão enxerga o application_name em pg_stat_activity", async () => {
      const client = await factory.create("advisory-lock")
      const pid = await backendPid(client)
      const result = await pool.query<{ application_name: string }>(
        "SELECT application_name FROM pg_stat_activity WHERE pid = $1",
        [pid]
      )
      expect(result.rows.at(0)?.application_name).toBe("api:advisory-lock")
    })

    it("aponta para o banco do worker, como o pool", async () => {
      const client = await factory.create("ready-check")
      const result = await client.query<{ current_database: string }>(
        "SELECT current_database()"
      )
      const expected = new URL(testDatabaseUrl()).pathname.slice(1)
      expect(result.rows.at(0)?.current_database).toBe(expected)
    })

    it("nasce fora do pool: não consome conexão do pool de aplicação", async () => {
      await pool.query("SELECT 1")
      const before = pool.totalCount

      await factory.create("outbox-listen")

      expect(pool.totalCount).toBe(before)
    })

    it("liveCount reflete criação e end()", async () => {
      expect(factory.liveCount()).toBe(0)
      const first = await factory.create("outbox-listen")
      expect(factory.liveCount()).toBe(1)
      const second = await factory.create("advisory-lock")
      expect(factory.liveCount()).toBe(2)

      const firstEnded = endOf(first)
      await first.end()
      await firstEnded
      expect(factory.liveCount()).toBe(1)

      const secondEnded = endOf(second)
      await second.end()
      await secondEnded
      expect(factory.liveCount()).toBe(0)
    })

    it("quebra por application_name bate com o que pg_stat_activity reporta", async () => {
      const clients = await Promise.all([
        factory.create("job:delivery.purge"),
        factory.create("job:delivery.purge"),
        factory.create("outbox-listen"),
      ])
      const pids = await Promise.all(clients.map(backendPid))

      expect(Object.fromEntries(factory.liveCountByApplicationName())).toEqual({
        "api:job:delivery.purge": 2,
        "api:outbox-listen": 1,
      })

      const observed = await pool.query<{
        application_name: string
        total: string
      }>(
        `SELECT application_name, count(*) AS total
           FROM pg_stat_activity
          WHERE pid = ANY($1::int[])
       GROUP BY application_name
       ORDER BY application_name`,
        [pids]
      )
      expect(
        observed.rows.map((row) => [row.application_name, Number(row.total)])
      ).toEqual([
        ["api:job:delivery.purge", 2],
        ["api:outbox-listen", 1],
      ])
    })

    it("client encerrado sai da quebra, e o propósito zerado some da série", async () => {
      const purge = await factory.create("job:delivery.purge")
      await factory.create("outbox-listen")
      const ended = endOf(purge)

      await purge.end()
      await ended

      expect(Object.fromEntries(factory.liveCountByApplicationName())).toEqual({
        "api:outbox-listen": 1,
      })
    })

    it("dá baixa também quando a sessão morre server-side", async () => {
      const client = await factory.create("outbox-listen")
      const pid = await backendPid(client)
      const ended = endOf(client)

      await pool.query("SELECT pg_terminate_backend($1)", [pid])
      await ended

      expect(factory.liveCount()).toBe(0)
    })

    it("onApplicationShutdown encerra os remanescentes", async () => {
      const first = await factory.create("outbox-listen")
      const second = await factory.create("advisory-lock")
      const pids = [await backendPid(first), await backendPid(second)]
      expect(await liveSessions(pids)).toBe(2)

      await factory.onApplicationShutdown()

      expect(factory.liveCount()).toBe(0)
      await waitUntil(
        async () => (await liveSessions(pids)) === 0,
        "sessões dedicadas encerrarem no servidor"
      )
    })
  })

  describe("ManagedDedicatedClient", () => {
    const channel = "dedicated_client_int_spec"
    let readyCalls: number
    let payloads: string[]
    let managed: ManagedDedicatedClient

    beforeEach(() => {
      readyCalls = 0
      payloads = []
      managed = new ManagedDedicatedClient(
        factory,
        "outbox-listen",
        async (client) => {
          readyCalls += 1
          client.on("notification", (msg) => {
            payloads.push(msg.payload ?? "")
          })
          await client.query(`LISTEN ${channel}`)
        }
      )
    })

    afterEach(async () => {
      await managed.end()
    })

    it("reaproveita o mesmo client enquanto ele vive", async () => {
      const first = await managed.ensure()
      const second = await managed.ensure()

      expect(second).toBe(first)
      expect(readyCalls).toBe(1)
      expect(factory.liveCount()).toBe(1)
    })

    it("drop encerra o atual antes de qualquer novo existir", async () => {
      await managed.ensure()
      expect(factory.liveCount()).toBe(1)

      await managed.drop("teste")

      expect(factory.liveCount()).toBe(0)
    })

    it("end() não deixa client vivo", async () => {
      await managed.ensure()

      await managed.end()

      expect(factory.liveCount()).toBe(0)
    })

    it("onReady que falha não deixa client vivo", async () => {
      const quebrado = new ManagedDedicatedClient(
        factory,
        "outbox-listen",
        async (client) => {
          await client.query("SELECT 1")
          throw new Error("preparação falhou")
        }
      )

      await expect(quebrado.ensure()).rejects.toThrow("preparação falhou")

      expect(factory.liveCount()).toBe(0)
    })

    it("não martela o Postgres: falha recente é reapresentada sem nova tentativa", async () => {
      const foraDoAr = new DedicatedClientFactory(
        makeTestLogger().loggerFactory.forModule("teste"),
        parseEnv({
          ...process.env,
          DATABASE_URL: "postgres://u:p@127.0.0.1:1/indisponivel",
          WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
          REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
        })
      )
      const spy = vi.spyOn(foraDoAr, "create")
      const gerenciado = new ManagedDedicatedClient(foraDoAr, "outbox-listen")

      const primeira = await gerenciado.ensure().catch((err: unknown) => err)
      const segunda = await gerenciado.ensure().catch((err: unknown) => err)

      expect(primeira).toBeInstanceOf(Error)
      expect(segunda).toBe(primeira)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(foraDoAr.liveCount()).toBe(0)
    })

    it("reconecta após pg_terminate_backend e reexecuta o onReady", async () => {
      const first = await managed.ensure()
      expect(readyCalls).toBe(1)
      await pool.query(`NOTIFY ${channel}, 'antes'`)
      await waitUntil(() => payloads.includes("antes"), "NOTIFY antes da queda")

      const pid = await backendPid(first)
      const ended = endOf(first)
      await pool.query("SELECT pg_terminate_backend($1)", [pid])
      await ended
      expect(factory.liveCount()).toBe(0)

      const second = await managed.ensure()

      expect(second).not.toBe(first)
      expect(readyCalls).toBe(2)
      expect(factory.liveCount()).toBe(1)
      await pool.query(`NOTIFY ${channel}, 'depois'`)
      await waitUntil(
        () => payloads.includes("depois"),
        "NOTIFY após a reconexão"
      )
    })

    it("nunca mantém dois clients vivos ao trocar de conexão", async () => {
      const liveAtCreate: number[] = []
      const create = factory.create.bind(factory)
      const spy = vi
        .spyOn(factory, "create")
        .mockImplementation((purpose: string) => {
          liveAtCreate.push(factory.liveCount())
          return create(purpose)
        })

      try {
        const first = await managed.ensure()
        expect(factory.liveCount()).toBe(1)

        // 'error' num client cuja sessão continua de pé: é o caso em que a ordem
        // invertida (criar antes de encerrar) deixaria dois clients vivos.
        first.emit("error", new Error("canal perdido"))
        expect(factory.liveCount()).toBe(1)

        const second = await managed.ensure()

        expect(second).not.toBe(first)
        expect(liveAtCreate).toEqual([0, 0])
        expect(factory.liveCount()).toBe(1)
      } finally {
        spy.mockRestore()
      }
    })
  })
})
