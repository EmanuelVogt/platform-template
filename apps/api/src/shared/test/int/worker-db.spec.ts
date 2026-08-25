import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { lockDirectory } from "./worker-db"

import type * as WorkerDb from "./worker-db"

/** Cada import recomeça a memoização — é o que simula outro processo de worker. */
async function freshModule(): Promise<typeof WorkerDb> {
  vi.resetModules()
  return import("./worker-db.js")
}

/** Fora da faixa de `kern.maxproc`: `process.kill` responde ESRCH. */
const DEAD_PID = 4_194_305

describe("claimWorkerDatabaseIndex", () => {
  let runKey: string

  beforeEach(() => {
    runKey = `postgres://localhost:${Math.floor(Math.random() * 1e6)}/base`
    vi.stubEnv("VITEST_POOL_ID", "1")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("reivindica o slot sugerido pelo pool id quando ele está livre", async () => {
    const { claimWorkerDatabaseIndex } = await freshModule()

    expect(claimWorkerDatabaseIndex(runKey, 4)).toBe(1)
  })

  it("dá o mesmo índice em toda chamada do mesmo processo", async () => {
    const { claimWorkerDatabaseIndex } = await freshModule()

    const first = claimWorkerDatabaseIndex(runKey, 4)

    expect(claimWorkerDatabaseIndex(runKey, 4)).toBe(first)
  })

  it("desvia do slot que outro worker vivo já tem, mesmo com o pool id repetido", async () => {
    const holder = await freshModule()
    holder.claimWorkerDatabaseIndex(runKey, 4)

    const second = await freshModule()

    expect(second.claimWorkerDatabaseIndex(runKey, 4)).toBe(2)
  })

  it("toma o slot cujo dono morreu sem liberar o lock", async () => {
    const directory = lockDirectory(runKey)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, "w1.lock"), String(DEAD_PID))
    const { claimWorkerDatabaseIndex } = await freshModule()

    expect(claimWorkerDatabaseIndex(runKey, 4)).toBe(1)
    expect(readFileSync(join(directory, "w1.lock"), "utf8")).toBe(
      String(process.pid)
    )
  })

  it("isola runs diferentes: a mesma sugestão volta a valer noutra URI", async () => {
    const holder = await freshModule()
    holder.claimWorkerDatabaseIndex(runKey, 4)

    const other = await freshModule()

    expect(other.claimWorkerDatabaseIndex(`${runKey}/outro`, 4)).toBe(1)
  })
})

describe("workerDatabaseCount", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("lê o teto declarado pelo config do tier", async () => {
    vi.stubEnv("TEST_DB_WORKERS", "4")
    const { workerDatabaseCount } = await freshModule()

    expect(workerDatabaseCount()).toBe(4)
  })

  it("recusa valor ausente em vez de assumir um default", async () => {
    vi.stubEnv("TEST_DB_WORKERS", "")
    const { workerDatabaseCount } = await freshModule()

    expect(() => workerDatabaseCount()).toThrow(/TEST_DB_WORKERS/)
  })

  it("recusa valor não inteiro", async () => {
    vi.stubEnv("TEST_DB_WORKERS", "dois")
    const { workerDatabaseCount } = await freshModule()

    expect(() => workerDatabaseCount()).toThrow(/TEST_DB_WORKERS/)
  })
})
