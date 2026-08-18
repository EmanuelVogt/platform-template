import { performance } from "node:perf_hooks"

import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import { SpanStatusCode, trace } from "@opentelemetry/api"

import { DedicatedClientFactory } from "../../infra/database/dedicated-client.factory"
import { buildJobContextStore } from "../context/job-context"
import { RequestContext } from "../context/request-context"
import { type AppLogger, LoggerFactory } from "../logging/logger.factory"
import { TransactionManager } from "../transactional/transaction-manager"

import { advisorySessionUnlock, tryAdvisorySessionLock } from "./advisory-lock"
import {
  MAINTENANCE_SCHEDULE,
  type MaintenanceJobName,
} from "./maintenance-schedule"

import type { Client } from "pg"

const tracer = trace.getTracer("maintenance")

export type JobOutcome = "completed" | "skipped" | "failed"

export type JobRunRecord = {
  readonly name: MaintenanceJobName
  readonly outcome: JobOutcome
  readonly finishedAt: number
  readonly durationMs: number
  readonly error: string | null
}

let activeRuntime: MaintenanceRuntime | null = null

/**
 * Registry estático: o decorator `@MaintenanceJob` não passa pela DI do Nest e
 * alcança o runtime por aqui (mesmo idioma do `TransactionManager`).
 */
export function getActiveMaintenanceRuntime(): MaintenanceRuntime | null {
  return activeRuntime
}

function setActiveRuntime(runtime: MaintenanceRuntime | null): void {
  activeRuntime = runtime
}

@Injectable()
export class MaintenanceRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly log: AppLogger
  private readonly lastRun = new Map<MaintenanceJobName, JobRunRecord>()

  constructor(
    private readonly txm: TransactionManager,
    private readonly requestContext: RequestContext,
    loggerFactory: LoggerFactory,
    private readonly dedicatedClients: DedicatedClientFactory
  ) {
    this.log = loggerFactory.forModule("MaintenanceRuntime")
  }

  onModuleInit(): void {
    setActiveRuntime(this)
  }

  onModuleDestroy(): void {
    if (activeRuntime === this) {
      setActiveRuntime(null)
    }
  }

  /** Snapshot do último run de cada job (observabilidade in-memory). */
  lastRuns(): JobRunRecord[] {
    return [...this.lastRun.values()]
  }

  /**
   * Envelope de todo job de manutenção: contexto sintético + span + advisory
   * lock de sessão num client dedicado (fora do pool de aplicação) + isolamento
   * de falha. Um caminho só, igual para cron e disparo manual: o lock nunca
   * ocupa conexão do pool, e `atomic: true` decide apenas se o corpo roda
   * dentro de uma transação aberta DEPOIS do lock.
   */
  async run(name: MaintenanceJobName, body: () => Promise<void>): Promise<void> {
    await this.requestContext.run(buildJobContextStore(), () =>
      this.runGuarded(name, body)
    )
  }

  /**
   * Disparo manual: tenta o lock SEM bloquear e devolve na hora — `false` = não
   * começou (já rodando, ou sessão dedicada indisponível) e o caller decide o
   * 409. Com o lock na mão, o corpo roda destacado da resposta HTTP, no mesmo
   * envelope (contexto sintético + span + unlock e client encerrados no
   * finally); erros são isolados e registrados como no cron.
   */
  async tryStartDetached(
    name: MaintenanceJobName,
    body: () => Promise<void>
  ): Promise<boolean> {
    const startedAt = performance.now()
    const client = await this.acquireSession(name, startedAt)
    if (!client) return false

    this.log.info("job.started", { job: name, trigger: "manual" })
    void this.requestContext.run(buildJobContextStore(), () =>
      this.withSpan(name, startedAt, () =>
        this.runOnSession(name, startedAt, client, body)
      )
    )
    return true
  }

  private async runGuarded(
    name: MaintenanceJobName,
    body: () => Promise<void>
  ): Promise<void> {
    const startedAt = performance.now()
    this.log.info("job.started", { job: name })

    await this.withSpan(name, startedAt, async () => {
      const client = await this.acquireSession(name, startedAt)
      if (!client) return
      await this.runOnSession(name, startedAt, client, body)
    })
  }

  /**
   * Client dedicado já com o advisory lock de sessão do job na mão. `null` =
   * job pulado sem tocar o pool de aplicação: ou o client dedicado não subiu,
   * ou o lock está com outra sessão (outra instância ou tick sobreposto).
   */
  private async acquireSession(
    name: MaintenanceJobName,
    startedAt: number
  ): Promise<Client | null> {
    const { lockId } = MAINTENANCE_SCHEDULE[name]
    let client: Client
    try {
      client = await this.dedicatedClients.create(`job:${name}`)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      this.log.warn("job.skipped", { job: name, reason })
      this.record(name, "skipped", startedAt, reason)
      return null
    }

    let locked: boolean
    try {
      locked = await tryAdvisorySessionLock(client, lockId)
    } catch (err) {
      await client.end()
      throw err
    }
    if (!locked) {
      await client.end()
      this.log.info("job.skipped", { job: name })
      this.record(name, "skipped", startedAt, null)
      return null
    }
    return client
  }

  /**
   * Corpo do job com o lock tomado. `atomic: true` abre a transação do pool de
   * aplicação aqui — depois do lock, nunca em volta dele. Lock e client saem no
   * finally: erro, guarda de conexão ou SIGTERM não deixam nenhum dos dois
   * pendurados.
   */
  private async runOnSession(
    name: MaintenanceJobName,
    startedAt: number,
    client: Client,
    body: () => Promise<void>
  ): Promise<void> {
    const spec = MAINTENANCE_SCHEDULE[name]
    try {
      try {
        await ("atomic" in spec && spec.atomic ? this.txm.run(body) : body())
        this.log.info("job.completed", {
          job: name,
          durationMs: elapsed(startedAt),
        })
        this.record(name, "completed", startedAt, null)
      } finally {
        await advisorySessionUnlock(client, spec.lockId)
      }
    } finally {
      await client.end()
    }
  }

  private async withSpan(
    name: MaintenanceJobName,
    startedAt: number,
    fn: () => Promise<void>
  ): Promise<void> {
    await tracer.startActiveSpan(`maintenance.${name}`, async (span) => {
      try {
        await fn()
        span.setStatus({ code: SpanStatusCode.OK })
      } catch (err) {
        // Isolamento: um job falhar não derruba o processo nem os outros jobs.
        const message = err instanceof Error ? err.message : String(err)
        this.log.error("job.failed", {
          job: name,
          durationMs: elapsed(startedAt),
          err,
        })
        this.record(name, "failed", startedAt, message)
        span.recordException(err instanceof Error ? err : new Error(message))
        span.setStatus({ code: SpanStatusCode.ERROR })
      } finally {
        span.end()
      }
    })
  }

  private record(
    name: MaintenanceJobName,
    outcome: JobOutcome,
    startedAt: number,
    error: string | null
  ): void {
    this.lastRun.set(name, {
      name,
      outcome,
      finishedAt: Date.now(),
      durationMs: elapsed(startedAt),
      error,
    })
  }
}

function elapsed(startedAt: number): number {
  return Math.round(performance.now() - startedAt)
}
