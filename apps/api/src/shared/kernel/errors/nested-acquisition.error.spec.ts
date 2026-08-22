import pino from "pino"

import { RequestContext } from "../context/request-context"
import { LoggerFactory } from "../logging/logger.factory"

import { DomainError } from "./domain.error"
import {
  describeCaller,
  NestedAcquisitionError,
} from "./nested-acquisition.error"
import { ProblemDetailsFilter } from "./problem-details.filter"

import type { ArgumentsHost } from "@nestjs/common"
import { describe, expect, it } from "vitest"

function makeHost(captured: { status?: number; body?: unknown }): ArgumentsHost {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    type() {
      return res
    },
    json(payload: unknown) {
      captured.body = payload
      return res
    },
    header() {
      return res
    },
  }
  const req = { originalUrl: "/v1/creditos/extrato" }
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost
}

function servicoQualquerDeDominio(): string {
  return describeCaller()
}

describe("describeCaller", () => {
  it("nomeia o frame do chamador, com função e arquivo", () => {
    const caller = servicoQualquerDeDominio()
    expect(caller).toContain("servicoQualquerDeDominio")
    expect(caller).toContain("nested-acquisition.error.spec.ts")
  })

  it("não devolve o frame da própria função nem de node_modules", () => {
    const caller = servicoQualquerDeDominio()
    expect(caller).not.toContain("describeCaller")
    expect(caller).not.toContain("node_modules")
  })
})

describe("NestedAcquisitionError", () => {
  it("não é DomainError — cai no fallback genérico do filtro", () => {
    expect(new NestedAcquisitionError("x")).not.toBeInstanceOf(DomainError)
    expect(new NestedAcquisitionError("x").name).toBe("NestedAcquisitionError")
  })

  it("a mensagem nomeia o chamador e aponta as saídas suportadas", () => {
    const err = new NestedAcquisitionError(servicoQualquerDeDominio())
    expect(err.message).toContain("servicoQualquerDeDominio")
    expect(err.message).toContain("getExecutor()")
    expect(err.message).toContain("requires_new")
    expect(err.message).toContain("onCommit")
  })

  it("o ProblemDetailsFilter responde 500 genérico sem ecoar a mensagem", () => {
    const ctx = new RequestContext()
    const factory = new LoggerFactory(ctx, pino({ level: "silent" }))
    const filter = new ProblemDetailsFilter(factory, ctx)
    const captured: { status?: number; body?: unknown } = {}

    filter.catch(
      new NestedAcquisitionError(servicoQualquerDeDominio()),
      makeHost(captured)
    )

    expect(captured.status).toBe(500)
    const body = captured.body as Record<string, unknown>
    expect(body.title).toBe("Erro interno")
    expect(body).not.toHaveProperty("detail")
    const json = JSON.stringify(body)
    expect(json).not.toContain("servicoQualquerDeDominio")
    expect(json).not.toContain("nested-acquisition.error.spec.ts")
    expect(json).not.toContain("getExecutor")
  })
})
