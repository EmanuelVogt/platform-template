import { makeTestLogger } from "../../../../test/setup/test-logger"
import { NestedAcquisitionError } from "../errors/nested-acquisition.error"

import {
  currentTxScope,
  hasActiveTransaction,
  runInTxScope,
  type TxScope,
} from "./transaction-context"
import { TransactionManager } from "./transaction-manager"

import type {
  DrizzleDb,
  DrizzleExecutor,
} from "../../infra/database/drizzle.provider"
import { describe, expect, it } from "vitest"

function makeScope(): TxScope {
  return { executor: {} as unknown as DrizzleExecutor, onCommit: [] }
}

describe("transaction-context (ALS da transação)", () => {
  it("fora de escopo não há transação corrente", () => {
    expect(currentTxScope()).toBeUndefined()
    expect(hasActiveTransaction()).toBe(false)
  })

  it("dentro do escopo expõe o mesmo objeto e acusa transação ativa", () => {
    const scope = makeScope()
    runInTxScope(scope, () => {
      expect(currentTxScope()).toBe(scope)
      expect(hasActiveTransaction()).toBe(true)
    })
  })

  it("devolve o valor da função e restaura o escopo anterior ao sair", async () => {
    const scope = makeScope()
    const value = await runInTxScope(scope, async () => {
      expect(hasActiveTransaction()).toBe(true)
      return "ok"
    })
    expect(value).toBe("ok")
    expect(hasActiveTransaction()).toBe(false)
  })

  it("escopo aninhado sobrepõe o de fora e devolve o de fora ao terminar", () => {
    const outer = makeScope()
    const inner = makeScope()
    runInTxScope(outer, () => {
      runInTxScope(inner, () => {
        expect(currentTxScope()).toBe(inner)
      })
      expect(currentTxScope()).toBe(outer)
    })
  })

  it("é singleton de módulo: o escopo é visível para qualquer chamador do processo", () => {
    const scope = makeScope()
    const leitorSemDi = (): boolean => hasActiveTransaction()
    runInTxScope(scope, () => {
      expect(leitorSemDi()).toBe(true)
    })
    expect(leitorSemDi()).toBe(false)
  })
})

describe("TransactionManager.outsideTransaction", () => {
  function makeManager(): { manager: TransactionManager; db: DrizzleDb } {
    const db = {} as unknown as DrizzleDb
    return {
      manager: new TransactionManager(db, makeTestLogger().loggerFactory),
      db,
    }
  }

  it("fora de transação devolve o executor da raiz", () => {
    const { manager, db } = makeManager()
    expect(manager.outsideTransaction()).toBe(db)
  })

  it("com transação ativa lança NestedAcquisitionError", () => {
    const { manager } = makeManager()
    runInTxScope(makeScope(), () => {
      expect(() => manager.outsideTransaction()).toThrow(NestedAcquisitionError)
    })
  })

  it("lança também fora de NODE_ENV=test — não há escape por ambiente", () => {
    const { manager } = makeManager()
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      runInTxScope(makeScope(), () => {
        expect(() => manager.outsideTransaction()).toThrow(
          NestedAcquisitionError
        )
      })
    } finally {
      process.env.NODE_ENV = original
    }
  })
})
