import { ServiceUnavailableException } from "@nestjs/common"
import { type Mock, describe, expect, it, vi } from "vitest"

import { HealthController } from "./health.controller"

import type { DedicatedClientFactory } from "../../infra/database/dedicated-client.factory"
import type { LoggerFactory } from "../logging/logger.factory"
import type { Client } from "pg"

function makeController(query: () => Promise<unknown>): {
  ctrl: HealthController
  errorSpy: Mock
} {
  const errorSpy = vi.fn()
  const lf = {
    forModule: () => ({
      error: errorSpy,
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  } as unknown as LoggerFactory
  const client = { query, on: vi.fn() } as unknown as Client
  const factory = {
    create: () => Promise.resolve(client),
  } as unknown as DedicatedClientFactory
  return { ctrl: new HealthController(factory, lf), errorSpy }
}

describe("HealthController.readiness", () => {
  it("retorna ready quando o banco responde, sem log de erro", async () => {
    const { ctrl, errorSpy } = makeController(() => Promise.resolve())
    expect(await ctrl.readiness()).toEqual({ status: "ready" })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("loga o err e lança 503 quando o banco falha", async () => {
    const { ctrl, errorSpy } = makeController(() =>
      Promise.reject(new Error("conn refused at /pg/internal"))
    )
    await expect(ctrl.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(errorSpy).toHaveBeenCalledWith(
      "readiness_db_check_failed",
      expect.objectContaining({ err: expect.any(Error) })
    )
  })

  it("a exceção 503 não vaza o detalhe do banco", async () => {
    const { ctrl } = makeController(() =>
      Promise.reject(new Error("conn refused at /pg/internal"))
    )
    await expect(ctrl.readiness()).rejects.toThrow(
      "Banco de dados indisponível"
    )
  })
})
