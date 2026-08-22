import { eq } from "drizzle-orm"


import {
  createTestDb,
  createTestPool,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../test/setup/test-logger"
import { NestedAcquisitionError } from "../errors/nested-acquisition.error"
import { processedEvents } from "../outbox/processed-events.table"

import { TransactionManager } from "./transaction-manager"

import type { DrizzleDb } from "../../infra/database/drizzle.provider"
import type { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

describe("TransactionManager (integração)", () => {
  let pool: Pool
  let db: DrizzleDb
  let txm: TransactionManager

  beforeAll(() => {
    pool = createTestPool()
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

  it("commita as escritas do run", async () => {
    await txm.run(async () => {
      await insert("e1")
    })
    expect(await ids()).toEqual(["e1"])
  })

  it("faz rollback quando o run lança", async () => {
    await expect(
      txm.run(async () => {
        await insert("e2")
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")
    expect(await ids()).toEqual([])
  })

  it("join: run aninhado compartilha a tx (rollback derruba os dois)", async () => {
    await expect(
      txm.run(async () => {
        await insert("a")
        await txm.run(async () => {
          await insert("b")
        })
        throw new Error("rollback")
      })
    ).rejects.toThrow()
    expect(await ids()).toEqual([])
  })

  it("requires_new: savepoint enxerga escrita não-commitada do pai", async () => {
    let innerSawParent = false
    await txm.run(async () => {
      await insert("parent")
      await txm.run(
        async () => {
          const rows = await txm
            .getExecutor()
            .select()
            .from(processedEvents)
            .where(eq(processedEvents.eventId, "parent"))
          innerSawParent = rows.length === 1
        },
        { propagation: "requires_new" }
      )
    })
    expect(innerSawParent).toBe(true)
  })

  it("requires_new: rollback do savepoint não derruba o pai", async () => {
    await txm.run(async () => {
      await insert("outer")
      await expect(
        txm.run(
          async () => {
            await insert("inner")
            throw new Error("inner falha")
          },
          { propagation: "requires_new" }
        )
      ).rejects.toThrow()
    })
    expect(await ids()).toEqual(["outer"])
  })

  it("onCommit roda após o COMMIT", async () => {
    let ran = false
    await txm.run(async () => {
      txm.onCommit(() => {
        ran = true
      })
      expect(ran).toBe(false)
    })
    expect(ran).toBe(true)
  })

  it("falha em onCommit não desfaz o commit", async () => {
    await expect(
      txm.run(async () => {
        await insert("e9")
        txm.onCommit(() => {
          throw new Error("hook falhou")
        })
      })
    ).resolves.toBeUndefined()
    expect(await ids()).toEqual(["e9"])
  })

  it("getExecutor fora de tx usa a raiz (autocommit)", async () => {
    await insert("root1")
    expect(await ids()).toEqual(["root1"])
  })

  it("requires_new: onCommit defere até o COMMIT do pai", async () => {
    let ran = false
    await txm.run(async () => {
      await txm.run(
        async () => {
          await insert("inner")
          txm.onCommit(() => {
            ran = true
          })
        },
        { propagation: "requires_new" }
      )
      // savepoint liberou, mas o hook deferiu para o COMMIT do pai
      expect(ran).toBe(false)
    })
    expect(ran).toBe(true)
  })

  it("outsideTransaction fora de tx grava na raiz", async () => {
    await txm
      .outsideTransaction()
      .insert(processedEvents)
      .values({ eventId: "fora", consumer: "c" })
    expect(await ids()).toEqual(["fora"])
  })

  it("outsideTransaction dentro do run lança e derruba a transação", async () => {
    await expect(
      txm.run(async () => {
        await insert("nao-persiste")
        txm.outsideTransaction()
      })
    ).rejects.toThrow(NestedAcquisitionError)
    expect(await ids()).toEqual([])
  })

  it("outsideTransaction lança também dentro de requires_new", async () => {
    await expect(
      txm.run(async () => {
        await txm.run(
          () => {
            txm.outsideTransaction()
            return Promise.resolve()
          },
          { propagation: "requires_new" }
        )
      })
    ).rejects.toThrow(NestedAcquisitionError)
  })

  it("requires_new: rollback do pai cancela onCommit deferido", async () => {
    let ran = false
    await expect(
      txm.run(async () => {
        await txm.run(
          async () => {
            await insert("inner")
            txm.onCommit(() => {
              ran = true
            })
          },
          { propagation: "requires_new" }
        )
        throw new Error("pai falha")
      })
    ).rejects.toThrow("pai falha")
    expect(ran).toBe(false)
  })
})
