import { Subject } from "rxjs"

import { SseController } from "./sse.controller"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { ConnectionRegistryPort } from "../../../domain/ports/connection-registry.port"
import type { MessageEvent } from "@nestjs/common"
import type { Request } from "express"

// WEB_ORIGIN em process.env vem de test/setup/unit-env.ts.
const SAME_ORIGIN = "http://localhost:5173"

describe("SseController", () => {
  it("registra a conexão pro recipient autenticado e fecha no close do request", () => {
    const subject = new Subject<MessageEvent>()
    const close = jest.fn()
    const register = jest.fn().mockReturnValue({ stream: subject.asObservable(), close })
    const registry = { register } as unknown as ConnectionRegistryPort
    const ctx = { getActor: () => ({ id: "u1", kind: "user" }) } as unknown as RequestContext

    const handlers = new Map<string, () => void>()
    const req = {
      headers: {},
      on: (event: string, cb: () => void) => handlers.set(event, cb),
    } as unknown as Request

    const stream = new SseController(registry, ctx).stream(req)

    expect(register).toHaveBeenCalledWith("u1")
    expect(stream).toBeDefined()
    handlers.get("close")?.()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("sem userId no contexto → lança (rota exige sessão)", () => {
    const registry = { register: jest.fn() } as unknown as ConnectionRegistryPort
    const ctx = { getActor: () => null } as unknown as RequestContext
    const req = { headers: {}, on: jest.fn() } as unknown as Request
    expect(() => new SseController(registry, ctx).stream(req)).toThrow()
  })

  it("Origin igual a WEB_ORIGIN registra normalmente", () => {
    const subject = new Subject<MessageEvent>()
    const register = jest
      .fn()
      .mockReturnValue({ stream: subject.asObservable(), close: jest.fn() })
    const registry = { register } as unknown as ConnectionRegistryPort
    const ctx = { getActor: () => ({ id: "u1", kind: "user" }) } as unknown as RequestContext
    const req = {
      headers: { origin: SAME_ORIGIN },
      on: jest.fn(),
    } as unknown as Request

    const stream = new SseController(registry, ctx).stream(req)

    expect(register).toHaveBeenCalledWith("u1")
    expect(stream).toBeDefined()
  })

  it("Origin diferente de WEB_ORIGIN → 403, sem registrar a conexão", () => {
    const register = jest.fn()
    const registry = { register } as unknown as ConnectionRegistryPort
    const ctx = { getActor: () => ({ id: "u1", kind: "user" }) } as unknown as RequestContext
    const req = {
      headers: { origin: "https://evil.example" },
      on: jest.fn(),
    } as unknown as Request

    expect(() => new SseController(registry, ctx).stream(req)).toThrow(
      expect.objectContaining({ status: 403 })
    )
    expect(register).not.toHaveBeenCalled()
  })
})
