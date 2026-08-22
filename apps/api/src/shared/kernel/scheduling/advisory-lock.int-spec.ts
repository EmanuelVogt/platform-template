import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDb, createTestPool } from "../../../../test/setup/test-db"

import {
  advisorySessionUnlock,
  advisoryXactLock,
  hashLockId,
  SCHEDULING_LOCK_NAMESPACE,
  tryAdvisorySessionLock,
} from "./advisory-lock"

import type { DrizzleDb } from "../../infra/database/drizzle.provider"
import type { Pool, PoolClient } from "pg"

describe("advisoryXactLock (integração)", () => {
  let pool: Pool
  let db: DrizzleDb

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  it("resolve imediatamente quando destravado", async () => {
    const lockId = hashLockId("guest-uncontended")
    const acquisitions: string[] = []
    const take = async (label: string): Promise<void> => {
      await db.transaction(async (tx) => {
        await advisoryXactLock(tx, SCHEDULING_LOCK_NAMESPACE, lockId)
        acquisitions.push(label)
      })
    }

    // Duas passagens seguidas pelo mesmo id: a segunda só entra porque o lock
    // é xact-scoped e saiu no COMMIT da primeira — segurar aqui trava, não
    // atrasa.
    await take("primeira")
    await take("segunda")

    expect(acquisitions).toEqual(["primeira", "segunda"])
  })

  it("ids diferentes não bloqueiam entre si", async () => {
    const aHolding = deferred()
    const releaseA = deferred()
    let aFinished = false

    const pA = db
      .transaction(async (tx) => {
        await advisoryXactLock(
          tx,
          SCHEDULING_LOCK_NAMESPACE,
          hashLockId("guest-a", "reservation-1")
        )
        aHolding.resolve()
        await releaseA.promise
      })
      .then(() => {
        aFinished = true
      })

    await aHolding.promise

    const pB = db.transaction(async (tx) => {
      await advisoryXactLock(
        tx,
        SCHEDULING_LOCK_NAMESPACE,
        hashLockId("guest-b", "reservation-1")
      )
    })
    await pB

    // B commitou com A ainda segurando o lock dela: ids distintos não
    // serializam (com o mesmo id, `await pB` só sairia depois de releaseA).
    expect(aFinished).toBe(false)

    releaseA.resolve()
    await pA
    expect(aFinished).toBe(true)
  })

  it("mesmo id serializa: a 2ª tx só progride após a 1ª commitar", async () => {
    const lockId = hashLockId("guest-serialize", "reservation-2")
    const events: string[] = []
    const aHolding = deferred()
    const releaseA = deferred()
    let bAcquired = false

    const pA = db.transaction(async (tx) => {
      await advisoryXactLock(tx, SCHEDULING_LOCK_NAMESPACE, lockId)
      events.push("a-acquired")
      aHolding.resolve()
      await releaseA.promise
    })

    await aHolding.promise

    const pB = db.transaction(async (tx) => {
      await advisoryXactLock(tx, SCHEDULING_LOCK_NAMESPACE, lockId)
      bAcquired = true
      events.push("b-acquired")
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(bAcquired).toBe(false)

    releaseA.resolve()
    await pA
    await pB

    expect(events).toEqual(["a-acquired", "b-acquired"])
  })

  it("hashLockId é estável e cabe em int4 assinado", () => {
    const a = hashLockId("guest-1", "reservation-9")
    const b = hashLockId("guest-1", "reservation-9")
    const c = hashLockId("guest-1", "reservation-10")

    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(Number.isInteger(a)).toBe(true)
    expect(a).toBeGreaterThanOrEqual(-2_147_483_648)
    expect(a).toBeLessThanOrEqual(2_147_483_647)
  })
})

describe("advisory session lock", () => {
  let pool: Pool
  let a: PoolClient
  let b: PoolClient

  beforeAll(async () => {
    pool = createTestPool()
  })
  afterAll(async () => {
    await pool.end()
  })
  beforeEach(async () => {
    a = await pool.connect()
    b = await pool.connect()
  })
  afterEach(async () => {
    a.release()
    b.release()
  })

  it("segura o lock entre conexões e solta no unlock explícito", async () => {
    const lockId = 4242

    expect(await tryAdvisorySessionLock(a, lockId)).toBe(true)
    expect(await tryAdvisorySessionLock(b, lockId)).toBe(false)

    await advisorySessionUnlock(a, lockId)
    expect(await tryAdvisorySessionLock(b, lockId)).toBe(true)
    await advisorySessionUnlock(b, lockId)
  })

  it("não solta sozinho no fim de uma tx (é session-scoped)", async () => {
    const lockId = 4243
    expect(await tryAdvisorySessionLock(a, lockId)).toBe(true)
    await a.query("BEGIN")
    await a.query("SELECT 1")
    await a.query("COMMIT")
    expect(await tryAdvisorySessionLock(b, lockId)).toBe(false)
    await advisorySessionUnlock(a, lockId)
  })
})
