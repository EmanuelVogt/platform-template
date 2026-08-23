import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../test/setup/test-logger"
import { RequestContext } from "../context/request-context"
import { NestedAcquisitionError } from "../errors/nested-acquisition.error"
import { processedEvents } from "../outbox/processed-events.table"

import {
  getActiveTransactionManager,
  TransactionManager,
} from "./transaction-manager"

import type { DrizzleDb } from "../../infra/database/drizzle.provider"
import type { RequestContextStore } from "../context/request-context"
import type { Pool } from "pg"

function testStore(over: Partial<RequestContextStore> = {}): RequestContextStore {
  return {
    requestId: "req-1",
    correlationId: "corr-1",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http",
    actor: null,
    extensions: new Map(),
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: Date.now(),
    ...over,
  }
}

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
    const markRan = (): void => {
      ran = true
    }
    await txm.run(async () => {
      await txm.run(
        async () => {
          await insert("inner")
          txm.onCommit(markRan)
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
    const markRan = (): void => {
      ran = true
    }
    await expect(
      txm.run(async () => {
        await txm.run(
          async () => {
            await insert("inner")
            txm.onCommit(markRan)
          },
          { propagation: "requires_new" }
        )
        throw new Error("pai falha")
      })
    ).rejects.toThrow("pai falha")
    expect(ran).toBe(false)
  })

  it("onModuleInit registra o manager ativo para o @Transactional alcançar", () => {
    txm.onModuleInit()

    expect(getActiveTransactionManager()).toBe(txm)
  })

  it("onCommit fora de uma transação lança", () => {
    expect(() => {
      txm.onCommit(() => undefined)
    }).toThrow("onCommit exige uma transação aberta")
  })

  it("isInTransaction reflete a tx ativa dentro e fora do run", async () => {
    expect(txm.isInTransaction()).toBe(false)
    let insideRun = false
    await txm.run(async () => {
      insideRun = txm.isInTransaction()
    })
    expect(insideRun).toBe(true)
    expect(txm.isInTransaction()).toBe(false)
  })

  it("carimba app.audit_ctx com o ator do RequestContext dentro da tx", async () => {
    const requestContext = new RequestContext()
    const txmComContexto = new TransactionManager(
      db,
      makeTestLogger().loggerFactory,
      requestContext
    )
    const store = testStore({
      correlationId: "corr-audit",
      origin: "job",
      actor: { id: "user-42", kind: "user" },
    })
    // `observed` sai como retorno da cadeia awaited, nunca de mutação de um
    // `let` fechado por closure: reatribuir de dentro do callback aninhado
    // faz o checker perder a narrowing e ler o tipo como sempre-nulo no ponto
    // de uso (COV-08) — o retorno explícito devolve o tipo real, `string |
    // null`, e a asserção abaixo prova o conteúdo carimbado de verdade.
    const observed = await requestContext.run(store, () =>
      txmComContexto.run(async () => {
        const result = await txmComContexto
          .getExecutor()
          .execute<{ ctx: string }>(
            sql`SELECT current_setting('app.audit_ctx', true) AS ctx`
          )
        return result.rows.at(0)?.ctx ?? null
      })
    )

    expect(observed).not.toBeNull()
    expect(JSON.parse(observed ?? "")).toEqual({
      actor_user_id: "user-42",
      correlation_id: "corr-audit",
      origin: "job",
    })
  })
})
