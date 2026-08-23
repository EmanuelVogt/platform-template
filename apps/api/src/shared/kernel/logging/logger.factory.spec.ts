import { type Mock, describe, expect, it, vi } from "vitest"

import { buildJobContextStore } from "../context/job-context"
import { RequestContext } from "../context/request-context"

import { createRootLogger, LoggerFactory } from "./logger.factory"

import type { Logger } from "pino"
import type * as PinoModule from "pino"

const { env } = vi.hoisted(() => ({ env: vi.fn() }))

vi.mock("../../config/env", () => ({ env }))

const { pinoMock } = vi.hoisted(() => ({ pinoMock: vi.fn() }))

// Mock só o default (a fábrica chamada por createRootLogger): log.serializers.ts
// lê `pino.stdSerializers` do mesmo default no import time, então o mock
// precisa repassar o real para não quebrar esse import.
vi.mock("pino", async () => {
  const actual = await vi.importActual<typeof PinoModule>("pino")
  Object.assign(pinoMock, { stdSerializers: actual.stdSerializers })
  return { ...actual, default: pinoMock }
})

function withEnv(overrides: {
  NODE_ENV: string
  LOG_LEVEL?: string
}): void {
  pinoMock.mockClear()
  env.mockReturnValue({ OTEL_SERVICE_NAME: "api", ...overrides })
}

/**
 * `child` volta à parte (nunca via `root.child`): é um método de `pino.Logger`
 * que exige `this` amarrado, então lê-lo de volta do objeto tipado como
 * `Logger` é um unbound method mesmo sob dublê — o handle vem direto da
 * criação do mock.
 */
function makeRootLogger(): { root: Logger; child: Mock } {
  const child = vi.fn()
  const logger = {
    child,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
  child.mockReturnValue(logger)
  return { root: logger as unknown as Logger, child }
}

describe("createRootLogger", () => {
  it("em produção usa level info e não injeta o transport pretty", () => {
    withEnv({ NODE_ENV: "production" })
    createRootLogger()
    const options = (pinoMock as Mock).mock.calls[0]?.[0]
    expect(options).toMatchObject({ level: "info" })
    expect(options).not.toHaveProperty("transport")
  })

  it("em development usa level debug e injeta o transport pino-pretty", () => {
    withEnv({ NODE_ENV: "development" })
    createRootLogger()
    const options = (pinoMock as Mock).mock.calls[0]?.[0]
    expect(options).toMatchObject({
      level: "debug",
      transport: {
        target: "pino-pretty",
        options: { translateTime: "SYS:standard", singleLine: false },
      },
    })
  })

  it("em test não injeta pretty mesmo fora de produção", () => {
    withEnv({ NODE_ENV: "test" })
    createRootLogger()
    const options = (pinoMock as Mock).mock.calls[0]?.[0]
    expect(options).toMatchObject({ level: "debug" })
    expect(options).not.toHaveProperty("transport")
  })

  it("LOG_LEVEL explícito sobrepõe o default por ambiente", () => {
    withEnv({ NODE_ENV: "development", LOG_LEVEL: "warn" })
    createRootLogger()
    const options = (pinoMock as Mock).mock.calls[0]?.[0]
    expect(options).toMatchObject({ level: "warn" })
  })
})

describe("LoggerFactory.forModule", () => {
  it("vincula o logger filho ao nome do módulo pedido", () => {
    const { root, child } = makeRootLogger()
    const factory = new LoggerFactory(new RequestContext(), root)
    factory.forModule("billing")
    expect(child).toHaveBeenCalledWith({ scope: "billing" })
  })
})

describe("AppLogger — campos de contexto mesclados", () => {
  it("mescla requestId/correlationId/tenantId/userId do RequestContext no record", () => {
    const { root } = makeRootLogger()
    const ctx = new RequestContext()
    const store = buildJobContextStore({ actorId: "a-1", tenantId: "t-1" })
    const logger = new LoggerFactory(ctx, root).forModule("http")

    ctx.run(store, () => {
      logger.info("mensagem", { extra: 1 })
    })

    expect(root.info).toHaveBeenCalledWith(
      {
        requestId: store.requestId,
        correlationId: store.correlationId,
        causationId: store.causationId,
        tenantId: "t-1",
        userId: "a-1",
        extra: 1,
      },
      "mensagem"
    )
  })

  it("sem ator no contexto o userId cai em null", () => {
    const { root } = makeRootLogger()
    const ctx = new RequestContext()
    const store = buildJobContextStore({ tenantId: "t-1" })
    const logger = new LoggerFactory(ctx, root).forModule("http")

    ctx.run(store, () => {
      logger.info("mensagem")
    })

    expect(root.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
      "mensagem"
    )
  })

  it("fora de um escopo de request os campos de correlação vêm undefined", () => {
    const { root } = makeRootLogger()
    const logger = new LoggerFactory(new RequestContext(), root).forModule(
      "http"
    )
    const boom = new Error("falhou")

    logger.error("falha", { err: boom })

    expect(root.error).toHaveBeenCalledWith(
      {
        requestId: undefined,
        correlationId: undefined,
        causationId: undefined,
        tenantId: undefined,
        userId: null,
        err: boom,
      },
      "falha"
    )
  })
})
