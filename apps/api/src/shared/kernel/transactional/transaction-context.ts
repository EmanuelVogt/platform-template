import { AsyncLocalStorage } from "node:async_hooks"

import type { DrizzleExecutor } from "../../infra/database/drizzle.provider"

export type OnCommitCallback = () => Promise<void> | void

export type TxScope = {
  executor: DrizzleExecutor
  onCommit: OnCommitCallback[]
}

// Singleton de módulo, não campo de instância do TransactionManager: o pool é
// criado por factory, antes do container do Nest existir, e precisa enxergar a
// mesma transação corrente. `DrizzleExecutor` entra só como tipo — import de
// valor criaria o ciclo infra → kernel → infra em runtime.
const storage = new AsyncLocalStorage<TxScope>()

export function currentTxScope(): TxScope | undefined {
  return storage.getStore()
}

export function runInTxScope<T>(scope: TxScope, fn: () => T): T {
  return storage.run(scope, fn)
}

export function hasActiveTransaction(): boolean {
  return storage.getStore() !== undefined
}
