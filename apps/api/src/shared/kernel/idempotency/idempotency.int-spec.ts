import { and, eq } from "drizzle-orm"
import { beforeAll, describe, expect, it } from "vitest"

import { withTestDb } from "../../test/int/with-test-db"

import { IdempotencyRepository } from "./idempotency.repository"
import { idempotencyKeys } from "./idempotency.table"

const inOneHour = (): Date => new Date(Date.now() + 3_600_000)
const oneSecondAgo = (): Date => new Date(Date.now() - 1_000)

describe("IdempotencyRepository (integração)", () => {
  const suite = withTestDb({ schemas: ["_kernel"] })
  let repo: IdempotencyRepository

  beforeAll(() => {
    repo = new IdempotencyRepository(suite.txm)
  })

  it("tryReserve fresco retorna null e cria row in_progress", async () => {
    const res = await suite.txm.run(() =>
      repo.tryReserve({
        scope: "s",
        key: "k1",
        endpoint: "POST /x",
        requestHash: "h1",
        expiresAt: inOneHour(),
      })
    )
    expect(res).toBeNull()
    const rows = await suite.db.select().from(idempotencyKeys)
    expect(rows[0]?.status).toBe("in_progress")
  })

  it("conflito com chave viva retorna a row existente", async () => {
    const input = {
      scope: "s",
      key: "k2",
      endpoint: "POST /x",
      requestHash: "h1",
      expiresAt: inOneHour(),
    }
    await suite.txm.run(() => repo.tryReserve(input))
    const res = await suite.txm.run(() => repo.tryReserve(input))
    expect(res).not.toBeNull()
    expect(res?.status).toBe("in_progress")
  })

  it("complete grava status e response", async () => {
    await suite.txm.run(() =>
      repo.tryReserve({
        scope: "s",
        key: "k3",
        endpoint: "POST /x",
        requestHash: "h",
        expiresAt: inOneHour(),
      })
    )
    await suite.txm.run(() =>
      repo.complete("s", "k3", "completed", 201, { id: 1 })
    )

    const rows = await suite.db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, "s"), eq(idempotencyKeys.key, "k3")))
    expect(rows[0]?.status).toBe("completed")
    expect(rows[0]?.responseStatus).toBe(201)
  })

  it("chave expirada é reclamada (retorna null, hash atualizado)", async () => {
    await suite.txm.run(() =>
      repo.tryReserve({
        scope: "s",
        key: "k4",
        endpoint: "POST /x",
        requestHash: "old",
        expiresAt: oneSecondAgo(),
      })
    )
    const res = await suite.txm.run(() =>
      repo.tryReserve({
        scope: "s",
        key: "k4",
        endpoint: "POST /x",
        requestHash: "new",
        expiresAt: inOneHour(),
      })
    )
    expect(res).toBeNull()

    const rows = await suite.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, "k4"))
    expect(rows[0]?.requestHash).toBe("new")
    expect(rows[0]?.status).toBe("in_progress")
  })

  it("reopen é CAS: 1ª chamada em 'failed' true, 2ª (já in_progress) false", async () => {
    await suite.txm.run(() =>
      repo.tryReserve({
        scope: "s",
        key: "k5",
        endpoint: "POST /x",
        requestHash: "h",
        expiresAt: inOneHour(),
      })
    )
    await suite.txm.run(() => repo.complete("s", "k5", "failed", 500, null))

    const first = await suite.txm.run(() => repo.reopen("s", "k5"))
    expect(first).toBe(true)

    const rows = await suite.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, "k5"))
    expect(rows[0]?.status).toBe("in_progress")

    // Row já não está 'failed' → CAS não casa.
    const second = await suite.txm.run(() => repo.reopen("s", "k5"))
    expect(second).toBe(false)
  })

  it("deleteExpired remove só rows expiradas e retorna a contagem", async () => {
    await suite.txm.run(() =>
      repo.tryReserve({
        scope: "s",
        key: "alive",
        endpoint: "POST /x",
        requestHash: "h",
        expiresAt: inOneHour(),
      })
    )
    await suite.txm.run(() =>
      repo.tryReserve({
        scope: "s",
        key: "dead",
        endpoint: "POST /x",
        requestHash: "h",
        expiresAt: oneSecondAgo(),
      })
    )

    const removed = await repo.deleteExpired()
    expect(removed).toBe(1)

    const rows = await suite.db.select().from(idempotencyKeys)
    expect(rows.map((r) => r.key)).toEqual(["alive"])
  })

  it("reopen sob concorrência: exatamente um vencedor (sem double-exec)", async () => {
    await suite.txm.run(() =>
      repo.tryReserve({
        scope: "s",
        key: "k6",
        endpoint: "POST /x",
        requestHash: "h",
        expiresAt: inOneHour(),
      })
    )
    await suite.txm.run(() => repo.complete("s", "k6", "failed", 500, null))

    const results = await Promise.all([
      suite.txm.run(() => repo.reopen("s", "k6")),
      suite.txm.run(() => repo.reopen("s", "k6")),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})
