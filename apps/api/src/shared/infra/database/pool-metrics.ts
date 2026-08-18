import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { metrics } from "@opentelemetry/api"

import {
  type AppLogger,
  LoggerFactory,
} from "../../kernel/logging/logger.factory"

import { DedicatedClientFactory } from "./dedicated-client.factory"
import { PG_POOL } from "./drizzle.provider"

import type { MeteredPool, PoolStateSnapshot } from "./application-pool"
import type { Meter, ObservableGauge } from "@opentelemetry/api"

export type PoolMetricName =
  | "db_pool.connections_total"
  | "db_pool.connections_idle"
  | "db_pool.connections_waiting"
  | "db_pool.dedicated_clients"

export type PoolPoint = {
  metric: PoolMetricName
  value: number
  attrs: Readonly<Record<string, string>>
}

export type DedicatedClientCounter = {
  liveCountByApplicationName: () => ReadonlyMap<string, number>
}

const POOL_ATTRS = { pool: "application" } as const

export function toPoolStatePoints(state: PoolStateSnapshot): PoolPoint[] {
  return [
    {
      metric: "db_pool.connections_total",
      value: state.totalCount,
      attrs: POOL_ATTRS,
    },
    {
      metric: "db_pool.connections_idle",
      value: state.idleCount,
      attrs: POOL_ATTRS,
    },
    {
      metric: "db_pool.connections_waiting",
      value: state.waitingCount,
      attrs: POOL_ATTRS,
    },
  ]
}

/**
 * Série própria: client dedicado vive fora do pool e nunca entra nos contadores
 * dele. Sem o atributo `pool` de propósito — rotulá-lo `application` diria que
 * está no pool de aplicação, que é exatamente o contrário do que ele é. Um ponto
 * por `application_name` porque, numa saturação, a pergunta é qual client não
 * soltou, e o rótulo é o mesmo valor filtrável em `pg_stat_activity`.
 */
export function toDedicatedPoints(
  liveByApplicationName: ReadonlyMap<string, number>
): PoolPoint[] {
  return [...liveByApplicationName].map(([applicationName, value]) => ({
    metric: "db_pool.dedicated_clients",
    value,
    attrs: { application_name: applicationName },
  }))
}

type WarnLogger = {
  warn: (msg: string, meta?: Record<string, unknown>) => void
}

/** Isola cada fonte do callback OTel: uma leitura quebrada não apaga as outras gauges. */
export function safeObserve(
  log: WarnLogger,
  source: string,
  observe: () => void
): void {
  try {
    observe()
  } catch (err) {
    log.warn("db.pool_metrics_source_failed", { source, err })
  }
}

function createGauges(meter: Meter): Record<PoolMetricName, ObservableGauge> {
  return {
    "db_pool.connections_total": meter.createObservableGauge(
      "db_pool.connections_total",
      { description: "Conexões abertas no pool de aplicação" }
    ),
    "db_pool.connections_idle": meter.createObservableGauge(
      "db_pool.connections_idle",
      { description: "Conexões ociosas no pool de aplicação" }
    ),
    "db_pool.connections_waiting": meter.createObservableGauge(
      "db_pool.connections_waiting",
      { description: "Aquisições esperando na fila do pool de aplicação" }
    ),
    "db_pool.dedicated_clients": meter.createObservableGauge(
      "db_pool.dedicated_clients",
      {
        description:
          "Clients dedicados vivos por application_name, contados fora do pool",
      }
    ),
  }
}

@Injectable()
export class PoolMetrics implements OnModuleInit {
  private readonly log: AppLogger

  constructor(
    @Inject(PG_POOL) private readonly pool: MeteredPool,
    @Inject(DedicatedClientFactory)
    private readonly dedicated: DedicatedClientCounter,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("PoolMetrics")
  }

  onModuleInit(): void {
    const meter = metrics.getMeter("database")
    const gauges = createGauges(meter)
    const acquireDuration = meter.createHistogram(
      "db_pool.acquire_duration_ms",
      {
        description:
          "Tempo de espera até adquirir conexão do pool de aplicação",
        unit: "ms",
      }
    )
    this.pool.setAcquireObserver((waitedMs) => {
      acquireDuration.record(waitedMs, POOL_ATTRS)
    })
    meter.addBatchObservableCallback((result) => {
      this.collect((point) => {
        result.observe(gauges[point.metric], point.value, point.attrs)
      })
    }, Object.values(gauges))
  }

  collect(sink: (point: PoolPoint) => void): void {
    safeObserve(this.log, "pool_state", () => {
      for (const point of toPoolStatePoints(this.pool)) {
        sink(point)
      }
    })
    safeObserve(this.log, "dedicated_clients", () => {
      for (const point of toDedicatedPoints(
        this.dedicated.liveCountByApplicationName()
      )) {
        sink(point)
      }
    })
  }
}
