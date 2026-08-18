import { makeTestLogger } from "../../../../test/setup/test-logger"

import {
  PoolMetrics,
  safeObserve,
  toDedicatedPoints,
  toPoolStatePoints,
} from "./pool-metrics"

import type { AcquireObserver, MeteredPool } from "./application-pool"
import type { PoolPoint } from "./pool-metrics"

class StubPool implements MeteredPool {
  observer?: AcquireObserver

  constructor(
    readonly totalCount: number,
    readonly idleCount: number,
    readonly waitingCount: number
  ) {}

  setAcquireObserver(observe: AcquireObserver): void {
    this.observer = observe
  }
}

class BrokenPool implements MeteredPool {
  observer?: AcquireObserver
  readonly idleCount = 0
  readonly waitingCount = 0

  get totalCount(): number {
    throw new Error("leitura do pool falhou")
  }

  setAcquireObserver(observe: AcquireObserver): void {
    this.observer = observe
  }
}

type LiveByName = ReadonlyMap<string, number>

function makeMetrics(
  pool: MeteredPool,
  live: LiveByName | (() => LiveByName)
): PoolMetrics {
  const read = typeof live === "function" ? live : () => live
  return new PoolMetrics(
    pool,
    { liveCountByApplicationName: read },
    makeTestLogger().loggerFactory
  )
}

function collectFrom(metrics: PoolMetrics): PoolPoint[] {
  const points: PoolPoint[] = []
  metrics.collect((point) => points.push(point))
  return points
}

describe("toPoolStatePoints", () => {
  it("nomeia as três séries do pool com o atributo do pool de aplicação", () => {
    expect(
      toPoolStatePoints({ totalCount: 5, idleCount: 2, waitingCount: 3 })
    ).toEqual([
      {
        metric: "db_pool.connections_total",
        value: 5,
        attrs: { pool: "application" },
      },
      {
        metric: "db_pool.connections_idle",
        value: 2,
        attrs: { pool: "application" },
      },
      {
        metric: "db_pool.connections_waiting",
        value: 3,
        attrs: { pool: "application" },
      },
    ])
  })
})

describe("toDedicatedPoints", () => {
  it("client dedicado sai em série própria e nunca soma no total do pool", () => {
    const state = toPoolStatePoints({
      totalCount: 3,
      idleCount: 1,
      waitingCount: 0,
    })
    const dedicated = toDedicatedPoints(
      new Map([["api:outbox-listen", 7]])
    )

    expect(dedicated).toEqual([
      {
        metric: "db_pool.dedicated_clients",
        value: 7,
        attrs: { application_name: "api:outbox-listen" },
      },
    ])
    expect(state.map((p) => p.metric)).not.toContain(
      "db_pool.dedicated_clients"
    )
    expect(state.map((p) => p.value)).toEqual([3, 1, 0])
  })

  it("emite um ponto por application_name, sem somar propósitos diferentes", () => {
    expect(
      toDedicatedPoints(
        new Map([
          ["api:outbox-listen", 1],
          ["api:job:delivery.purge", 2],
        ])
      )
    ).toEqual([
      {
        metric: "db_pool.dedicated_clients",
        value: 1,
        attrs: { application_name: "api:outbox-listen" },
      },
      {
        metric: "db_pool.dedicated_clients",
        value: 2,
        attrs: { application_name: "api:job:delivery.purge" },
      },
    ])
  })

  it("sem client dedicado vivo não emite ponto algum", () => {
    expect(toDedicatedPoints(new Map())).toEqual([])
  })
})

describe("safeObserve", () => {
  it("fonte que lança não impede as demais nem propaga", () => {
    const calls: string[] = []
    const log = { warn: (msg: string) => calls.push(msg) }
    safeObserve(log, "pool_state", () => {
      throw new Error("boom")
    })
    safeObserve(log, "dedicated_clients", () => calls.push("dedicated-ok"))
    expect(calls).toEqual(["db.pool_metrics_source_failed", "dedicated-ok"])
  })
})

describe("PoolMetrics.collect", () => {
  it("entrega os contadores do pool e os dedicados como pontos distintos", () => {
    const points = collectFrom(
      makeMetrics(new StubPool(4, 1, 2), new Map([["api:ready", 6]]))
    )
    expect(points).toEqual([
      {
        metric: "db_pool.connections_total",
        value: 4,
        attrs: { pool: "application" },
      },
      {
        metric: "db_pool.connections_idle",
        value: 1,
        attrs: { pool: "application" },
      },
      {
        metric: "db_pool.connections_waiting",
        value: 2,
        attrs: { pool: "application" },
      },
      {
        metric: "db_pool.dedicated_clients",
        value: 6,
        attrs: { application_name: "api:ready" },
      },
    ])
  })

  it("pool que falha na leitura não apaga a série dos clients dedicados", () => {
    const metrics = makeMetrics(
      new BrokenPool(),
      new Map([["api:outbox-listen", 4]])
    )
    let points: PoolPoint[] = []
    expect(() => {
      points = collectFrom(metrics)
    }).not.toThrow()
    expect(points).toEqual([
      {
        metric: "db_pool.dedicated_clients",
        value: 4,
        attrs: { application_name: "api:outbox-listen" },
      },
    ])
  })

  it("lê o estado a cada coleta, não o do momento da construção", () => {
    let live: LiveByName = new Map([["api:outbox-listen", 1]])
    const metrics = makeMetrics(new StubPool(1, 1, 0), () => live)
    expect(collectFrom(metrics).at(3)?.value).toBe(1)
    live = new Map([["api:outbox-listen", 9]])
    expect(collectFrom(metrics).at(3)?.value).toBe(9)
  })
})

describe("PoolMetrics.onModuleInit sem exporter configurado", () => {
  it("cria instrumentos no-op sem quebrar e liga o observador de aquisição", () => {
    const pool = new StubPool(2, 2, 0)
    const metrics = makeMetrics(pool, new Map())

    expect(() => {
      metrics.onModuleInit()
    }).not.toThrow()
    expect(pool.observer).toBeDefined()
    expect(() => {
      pool.observer?.(123)
    }).not.toThrow()
  })
})
