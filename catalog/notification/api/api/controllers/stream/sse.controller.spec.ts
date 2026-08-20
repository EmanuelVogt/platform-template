import { Subject } from "rxjs"

import { SseController } from "./sse.controller"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { SseConnectionRegistry } from "../../../infrastructure/realtime/sse-connection-registry"
import type { MessageEvent } from "@nestjs/common"
import type { Request } from "express"

describe("SseController", () => {
  it("registra a conexão pro recipient autenticado e fecha no close do request", () => {
    const subject = new Subject<MessageEvent>()
    const close = jest.fn()
    const register = jest.fn().mockReturnValue({ stream: subject.asObservable(), close })
    const registry = { register } as unknown as SseConnectionRegistry
    const ctx = { getActor: () => ({ id: "u1", kind: "user" }) } as unknown as RequestContext

    const handlers = new Map<string, () => void>()
    const req = {
      on: (event: string, cb: () => void) => handlers.set(event, cb),
    } as unknown as Request

    const stream = new SseController(registry, ctx).stream(req)

    expect(register).toHaveBeenCalledWith("u1")
    expect(stream).toBeDefined()
    handlers.get("close")?.()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("sem userId no contexto → lança (rota exige sessão)", () => {
    const registry = { register: jest.fn() } as unknown as SseConnectionRegistry
    const ctx = { getActor: () => null } as unknown as RequestContext
    const req = { on: jest.fn() } as unknown as Request
    expect(() => new SseController(registry, ctx).stream(req)).toThrow()
  })
})
