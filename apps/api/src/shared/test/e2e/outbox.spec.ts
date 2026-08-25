import { describe, expect, it, vi } from "vitest"

import { OutboxDispatcher } from "../../kernel/outbox/outbox.dispatcher"

import { drainOutbox } from "./outbox"

import type { Pollable } from "./outbox"
import type { INestApplication } from "@nestjs/common"

const pollable = (): Pollable & { calls: number } => {
  const stub = { calls: 0, poll: () => Promise.resolve() }
  return {
    get calls() {
      return stub.calls
    },
    poll: () => {
      stub.calls += 1
      return Promise.resolve()
    },
  }
}

const appWith = (
  dispatcher: Pollable
): { app: INestApplication; get: ReturnType<typeof vi.fn> } => {
  const get = vi.fn(() => dispatcher)
  return { app: { get } as unknown as INestApplication, get }
}

describe("drainOutbox", () => {
  it("sem until dá uma volta em cada despachante", async () => {
    const kernel = pollable()
    const outro = pollable()

    await drainOutbox(appWith(kernel).app, { dispatchers: [kernel, outro] })

    expect([kernel.calls, outro.calls]).toEqual([1, 1])
  })

  it("sem dispatchers gira o despachante do kernel, e nenhum de módulo", async () => {
    const kernel = pollable()
    const { app, get } = appWith(kernel)

    await drainOutbox(app)

    expect(get).toHaveBeenCalledWith(OutboxDispatcher)
    expect(kernel.calls).toBe(1)
  })

  it("com until gira até o efeito aparecer e devolve o efeito", async () => {
    const kernel = pollable()
    const seen: string[] = []

    const found = await drainOutbox(appWith(kernel).app, {
      dispatchers: [kernel],
      intervalMs: 1,
      until: () => {
        seen.push("olhou")
        return seen.length >= 3 ? "e-mail" : undefined
      },
    })

    expect(found).toBe("e-mail")
    expect(kernel.calls).toBe(3)
  })

  it("o efeito que nunca aparece rejeita com o prazo na mensagem", async () => {
    const kernel = pollable()

    await expect(
      drainOutbox(appWith(kernel).app, {
        dispatchers: [kernel],
        timeoutMs: 20,
        intervalMs: 1,
        until: () => undefined,
      })
    ).rejects.toThrow("o efeito do outbox não ocorreu em 20ms")
  })
})
