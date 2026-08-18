import { Inject, Injectable, Optional, type OnModuleInit } from "@nestjs/common"
import { sql } from "drizzle-orm"

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from "../../infra/database/drizzle.provider"
import { RequestContext } from "../context/request-context"
import {
  describeCaller,
  NestedAcquisitionError,
} from "../errors/nested-acquisition.error"
import { type AppLogger, LoggerFactory } from "../logging/logger.factory"

import {
  currentTxScope,
  hasActiveTransaction,
  runInTxScope,
  type OnCommitCallback,
  type TxScope,
} from "./transaction-context"

export type IsolationLevel =
  | "read uncommitted"
  | "read committed"
  | "repeatable read"
  | "serializable"

export type TxOptions = {
  isolation?: IsolationLevel
  readOnly?: boolean
  propagation?: "required" | "requires_new"
}

let activeManager: TransactionManager | null = null

/**
 * Registry estático: decorator de método (`@Transactional`) não passa pela DI
 * do Nest, então alcança o manager por aqui. Populado no `onModuleInit`.
 */
export function getActiveTransactionManager(): TransactionManager | null {
  return activeManager
}

function setActiveManager(manager: TransactionManager | null): void {
  activeManager = manager
}

@Injectable()
export class TransactionManager implements OnModuleInit {
  private readonly log: AppLogger

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    loggerFactory: LoggerFactory,
    // @Optional: em prod o Nest injeta o singleton global (ContextModule);
    // construção manual em teste (sem container) chega undefined e o carimbo de
    // contexto é pulado sem erro. NÃO tipar como união (`RequestContext | null`):
    // o emitDecoratorMetadata viraria `Object` e o Nest não resolveria o provider.
    @Optional() private readonly requestContext?: RequestContext
  ) {
    this.log = loggerFactory.forModule("TransactionManager")
  }

  // Registro INTENCIONALMENTE sem desregistro no shutdown: onModuleDestroy
  // roda ANTES do onApplicationShutdown dos dispatchers (fases do Nest), então
  // desregistrar aqui faria o drain do outbox processar handlers com
  // @Transactional no-op — insert em autocommit e onCommit lançando. O
  // singleton morre com o processo (prod) ou com o module registry do jest.
  onModuleInit(): void {
    setActiveManager(this)
  }

  getExecutor(): DrizzleExecutor {
    return currentTxScope()?.executor ?? this.db
  }

  /**
   * Executor da raiz para escrita que precisa ficar fora de qualquer transação.
   * Com transação ativa lança em qualquer ambiente: uma segunda conexão pedida
   * de dentro de uma tx esgota o pool. A saída é gravar na própria tx
   * (`getExecutor`), abrir `requires_new` (SAVEPOINT, mesma conexão) ou adiar
   * com `onCommit`.
   */
  outsideTransaction(): DrizzleExecutor {
    if (hasActiveTransaction()) {
      throw new NestedAcquisitionError(describeCaller())
    }
    return this.db
  }

  isInTransaction(): boolean {
    return hasActiveTransaction()
  }

  /** Empilha callback executado após o COMMIT do escopo atual. */
  onCommit(cb: OnCommitCallback): void {
    const scope = currentTxScope()
    if (!scope) {
      throw new Error("onCommit exige uma transação aberta")
    }
    scope.onCommit.push(cb)
  }

  async run<T>(fn: () => Promise<T>, opts: TxOptions = {}): Promise<T> {
    const existing = currentTxScope()
    if (existing && opts.propagation !== "requires_new") {
      return fn()
    }

    const scope: TxScope = {
      executor: existing?.executor ?? this.db,
      onCommit: [],
    }
    const runInScope = (tx: DrizzleExecutor): Promise<T> => {
      scope.executor = tx
      return runInTxScope(scope, fn)
    }

    if (existing) {
      // requires_new aninhado: SAVEPOINT na conexão da tx externa (sem config).
      const nested = await existing.executor.transaction((tx) => runInScope(tx))
      // O savepoint ainda morre se a tx externa der rollback — defere os
      // onCommit ao COMMIT real do escopo pai em vez de disparar aqui.
      existing.onCommit.push(...scope.onCommit)
      return nested
    }

    const result = await this.db.transaction(
      async (tx) => {
        await this.applyAuditContext(tx)
        return runInScope(tx)
      },
      {
        isolationLevel: opts.isolation ?? "read committed",
        accessMode: opts.readOnly ? "read only" : "read write",
      }
    )
    await this.runOnCommit(scope.onCommit)
    return result
  }

  /**
   * Carimba o contexto do ator na tx física (GUC transaction-scoped) para a
   * trigger genérica de auditoria lê-lo em `app.audit_ctx`. Sem contexto de
   * request (boot hook, script sem store) o setting fica ausente e a trilha
   * grava a linha com origin `unknown` — nunca cega.
   */
  private async applyAuditContext(tx: DrizzleExecutor): Promise<void> {
    const store = this.requestContext?.tryGet()
    if (!store) return
    const payload = JSON.stringify({
      actor_user_id: store.userId,
      correlation_id: store.correlationId,
      origin: store.origin,
    })
    await tx.execute(sql`SELECT set_config('app.audit_ctx', ${payload}, true)`)
  }

  private async runOnCommit(callbacks: OnCommitCallback[]): Promise<void> {
    for (const cb of callbacks) {
      try {
        await cb()
      } catch (err) {
        // Pós-commit: a tx já persistiu. Falha de hook não desfaz o commit.
        this.log.error("transaction.on_commit_failed", { err })
      }
    }
  }
}
