import { firstValueFrom, of, throwError } from "rxjs"
import { type Mock, describe, expect, it, vi } from "vitest"

import { LogInterceptor, stripQuery } from "./log.interceptor"

import type { LoggerFactory } from "./logger.factory"
import type { CallHandler, ExecutionContext } from "@nestjs/common"

const { env } = vi.hoisted(() => ({ env: vi.fn() }))

vi.mock("../../config/env", () => ({ env }))

type CapturedLog = { info: Mock; error: Mock }

function makeInterceptor(nodeEnv: string): {
  interceptor: LogInterceptor
  log: CapturedLog
} {
  env.mockReturnValue({ NODE_ENV: nodeEnv })
  const log: CapturedLog = { info: vi.fn(), error: vi.fn() }
  const factory = { forModule: () => log } as unknown as LoggerFactory
  return { interceptor: new LogInterceptor(factory), log }
}

function makeExecutionContext(
  opts: {
    type?: string
    method?: string
    url?: string
    body?: unknown
    status?: number
  } = {}
): ExecutionContext {
  const request = {
    method: opts.method ?? "GET",
    originalUrl: opts.url ?? "/v1/things",
    body: opts.body,
  }
  const response = { statusCode: opts.status ?? 200 }
  return {
    getType: () => opts.type ?? "http",
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext
}

describe("stripQuery", () => {
  it("remove a query string", () => {
    expect(stripQuery("/v1/auth/reset-password?token=segredo")).toBe(
      "/v1/auth/reset-password"
    )
  })

  it("mantém a url sem query intacta", () => {
    expect(stripQuery("/v1/auth/login")).toBe("/v1/auth/login")
  })
})

describe("LogInterceptor", () => {
  it("fora do contexto http repassa o observable do handler sem logar", async () => {
    const { interceptor, log } = makeInterceptor("test")
    const handlerObservable = of("payload-direto")
    const next: CallHandler = { handle: () => handlerObservable }
    const result = interceptor.intercept(
      makeExecutionContext({ type: "rpc" }),
      next
    )
    expect(result).toBe(handlerObservable)
    expect(await firstValueFrom(result)).toBe("payload-direto")
    expect(log.info).not.toHaveBeenCalled()
    expect(log.error).not.toHaveBeenCalled()
  })

  it("em development loga reqBody e resBody redigidos", async () => {
    const { interceptor, log } = makeInterceptor("development")
    const next: CallHandler = {
      handle: () => of({ token: "segredo", ok: true }),
    }
    const ctx = makeExecutionContext({
      method: "POST",
      url: "/v1/things?page=2",
      body: { password: "1234", name: "a" },
      status: 201,
    })
    await firstValueFrom(interceptor.intercept(ctx, next))
    expect(log.info).toHaveBeenCalledWith("http", {
      method: "POST",
      url: "/v1/things",
      status: 201,
      durationMs: expect.any(Number),
      reqBody: { password: "[REDACTED]", name: "a" },
      resBody: { token: "[REDACTED]", ok: true },
    })
  })

  it("fora de development não loga corpo, só os campos de request/response", async () => {
    const { interceptor, log } = makeInterceptor("production")
    const next: CallHandler = { handle: () => of({ token: "segredo" }) }
    const ctx = makeExecutionContext({
      method: "GET",
      url: "/v1/things",
      body: { password: "x" },
      status: 200,
    })
    await firstValueFrom(interceptor.intercept(ctx, next))
    expect(log.info).toHaveBeenCalledWith("http", {
      method: "GET",
      url: "/v1/things",
      status: 200,
      durationMs: expect.any(Number),
    })
  })

  it("no erro loga log.error com err e sem status", async () => {
    const { interceptor, log } = makeInterceptor("production")
    const boom = new Error("boom")
    const next: CallHandler = { handle: () => throwError(() => boom) }
    const ctx = makeExecutionContext({ method: "POST", url: "/v1/things" })
    await expect(
      firstValueFrom(interceptor.intercept(ctx, next))
    ).rejects.toBe(boom)
    expect(log.error).toHaveBeenCalledWith("http", {
      method: "POST",
      url: "/v1/things",
      durationMs: expect.any(Number),
      err: boom,
    })
    expect(log.info).not.toHaveBeenCalled()
  })

  it.each([undefined, null, "abc", 42, {}])(
    "corpo %p não produz reqBody mesmo em development",
    async (body) => {
      const { interceptor, log } = makeInterceptor("development")
      const next: CallHandler = { handle: () => of({}) }
      const ctx = makeExecutionContext({ body })
      await firstValueFrom(interceptor.intercept(ctx, next))
      expect(log.info.mock.calls[0]?.[1]).not.toHaveProperty("reqBody")
    }
  )

  it("corpo populado produz reqBody redigido em development", async () => {
    const { interceptor, log } = makeInterceptor("development")
    const next: CallHandler = { handle: () => of({}) }
    const ctx = makeExecutionContext({ body: { password: "x", ok: true } })
    await firstValueFrom(interceptor.intercept(ctx, next))
    expect(log.info.mock.calls[0]?.[1]).toMatchObject({
      reqBody: { password: "[REDACTED]", ok: true },
    })
  })
})
