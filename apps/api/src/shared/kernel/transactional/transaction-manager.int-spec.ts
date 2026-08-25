import { eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { makeTestLogger } from "../../test/int/logger"
import { withTestDb } from "../../test/int/with-test-db"
import { fakeRequestContext } from "../../test/unit/request-context"
import { RequestContext } from "../context/request-context"
import { NestedAcquisitionError } from "../errors/nested-acquisition.error"
import { processedEvents } from "../outbox/processed-events.table"

import {
  getActiveTransactionManager,
  TransactionManager,
} from "./transaction-manager"

describe("TransactionManager (integração)", () => {
  const suite = withTestDb({ schemas: ["_kernel"] })

  function insert(eventId: string): Promise<unknown> {
    return suite.txm
      .getExecutor()
      .insert(processedEvents)
      .values({ eventId, consumer: "c" })
  }

  async function ids(): Promise<string[]> {
    const rows = await suite.db.select().from(processedEvents)
    return rows.map((r) => r.eventId).sort()
  }

  it("commita as escritas do run", async () => {
    await suite.txm.run(async () => {
      await insert("e1")
    })
    expect(await ids()).toEqual(["e1"])
  })

  it("faz rollback quando o run lança", async () => {
    await expect(
      suite.txm.run(async () => {
        await insert("e2")
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")
    expect(await ids()).toEqual([])
  })

  it("join: run aninhado compartilha a tx (rollback derruba os dois)", async () => {
    await expect(
      suite.txm.run(async () => {
        await insert("a")
        await suite.txm.run(async () => {
          await insert("b")
        })
        throw new Error("rollback")
      })
    ).rejects.toThrow()
    expect(await ids()).toEqual([])
  })

  it("requires_new: savepoint enxerga escrita não-commitada do pai", async () => {
    let innerSawParent = false
    await suite.txm.run(async () => {
      await insert("parent")
      await suite.txm.run(
        async () => {
          const rows = await suite.txm
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
    await suite.txm.run(async () => {
      await insert("outer")
      await expect(
        suite.txm.run(
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
    await suite.txm.run(async () => {
      suite.txm.onCommit(() => {
        ran = true
      })
      expect(ran).toBe(false)
    })
    expect(ran).toBe(true)
  })

  it("falha em onCommit não desfaz o commit", async () => {
    await expect(
      suite.txm.run(async () => {
        await insert("e9")
        suite.txm.onCommit(() => {
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
    await suite.txm.run(async () => {
      await suite.txm.run(
        async () => {
          await insert("inner")
          suite.txm.onCommit(markRan)
        },
        { propagation: "requires_new" }
      )
      // savepoint liberou, mas o hook deferiu para o COMMIT do pai
      expect(ran).toBe(false)
    })
    expect(ran).toBe(true)
  })

  it("outsideTransaction fora de tx grava na raiz", async () => {
    await suite.txm
      .outsideTransaction()
      .insert(processedEvents)
      .values({ eventId: "fora", consumer: "c" })
    expect(await ids()).toEqual(["fora"])
  })

  it("outsideTransaction dentro do run lança e derruba a transação", async () => {
    await expect(
      suite.txm.run(async () => {
        await insert("nao-persiste")
        suite.txm.outsideTransaction()
      })
    ).rejects.toThrow(NestedAcquisitionError)
    expect(await ids()).toEqual([])
  })

  it("outsideTransaction lança também dentro de requires_new", async () => {
    await expect(
      suite.txm.run(async () => {
        await suite.txm.run(
          () => {
            suite.txm.outsideTransaction()
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
      suite.txm.run(async () => {
        await suite.txm.run(
          async () => {
            await insert("inner")
            suite.txm.onCommit(markRan)
          },
          { propagation: "requires_new" }
        )
        throw new Error("pai falha")
      })
    ).rejects.toThrow("pai falha")
    expect(ran).toBe(false)
  })

  it("onModuleInit registra o manager ativo para o @Transactional alcançar", () => {
    suite.txm.onModuleInit()

    expect(getActiveTransactionManager()).toBe(suite.txm)
  })

  it("onCommit fora de uma transação lança", () => {
    expect(() => {
      suite.txm.onCommit(() => undefined)
    }).toThrow("onCommit exige uma transação aberta")
  })

  it("isInTransaction reflete a tx ativa dentro e fora do run", async () => {
    expect(suite.txm.isInTransaction()).toBe(false)
    let insideRun = false
    await suite.txm.run(async () => {
      insideRun = suite.txm.isInTransaction()
    })
    expect(insideRun).toBe(true)
    expect(suite.txm.isInTransaction()).toBe(false)
  })

  it("carimba app.audit_ctx com o ator do RequestContext dentro da tx", async () => {
    const requestContext = new RequestContext()
    const txmComContexto = new TransactionManager(
      suite.db,
      makeTestLogger().loggerFactory,
      requestContext
    )
    const store = fakeRequestContext({
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
        const result = await txmComContexto.getExecutor().execute<{
          ctx: string
        }>(sql`SELECT current_setting('app.audit_ctx', true) AS ctx`)
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
