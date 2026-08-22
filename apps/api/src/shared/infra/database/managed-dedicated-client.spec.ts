import { EventEmitter } from "node:events"

import { type Mock, describe, expect, it, vi } from "vitest"

import { ManagedDedicatedClient } from "./managed-dedicated-client"

import type { DedicatedClientFactory } from "./dedicated-client.factory"
import type { AppLogger } from "../../kernel/logging/logger.factory"
import type { Client } from "pg"

/**
 * Devolve o `end` mockado à parte (nunca via `client.end`): esse é um método
 * de `pg.Client` que exige `this` amarrado, então lê-lo de volta do objeto
 * tipado como `Client` é um unbound method mesmo sob dublê — o handle vem
 * direto da criação do mock.
 */
function fakeClient(): { client: Client; end: Mock } {
  const end = vi.fn().mockResolvedValue(undefined)
  const client = Object.assign(new EventEmitter(), {
    end,
    query: vi.fn(),
  }) as unknown as Client
  return { client, end }
}

/**
 * `ManagedDedicatedClient` nunca executa SQL por conta própria — delega a
 * conexão a uma `DedicatedClientFactory` injetada e o `onReady` é do
 * chamador. É lógica pura de ciclo de vida sobre um client injetado (COV-10):
 * dublê da factory e de um client fake, nunca um mock do banco.
 */
describe("ManagedDedicatedClient", () => {
  it("drop() loga e engole a falha de client.end() sem propagar", async () => {
    const { client, end } = fakeClient()
    end.mockRejectedValueOnce(new Error("socket já fechado"))
    const warn = vi.fn()
    const log = { warn } as unknown as AppLogger
    const factory = {
      create: () => Promise.resolve(client),
    } as unknown as DedicatedClientFactory
    const managed = new ManagedDedicatedClient(
      factory,
      "outbox-listen",
      undefined,
      log
    )
    await managed.ensure()

    await expect(managed.drop("teste")).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledWith(
      "db.dedicated_client_end_failed",
      expect.objectContaining({
        purpose: "outbox-listen",
        err: "socket já fechado",
      })
    )
  })

  it("end() aguarda uma conexão em andamento antes de encerrar, sem vazar o client", async () => {
    const { client, end } = fakeClient()
    let resolveCreate: (client: Client) => void = () => undefined
    const create = vi.fn(
      () => new Promise<Client>((resolve) => (resolveCreate = resolve))
    )
    const factory = { create } as unknown as DedicatedClientFactory
    const managed = new ManagedDedicatedClient(factory, "outbox-listen")

    const ensuring = managed.ensure()
    const ending = managed.end()
    // `connect()` só chama `factory.create` depois de um `await this.drop(...)`
    // interno (client ainda nulo, mas ainda uma volta ao microtask queue); um
    // macrotask garante que essa volta já aconteceu antes de resolver.
    await new Promise((resolve) => setImmediate(resolve))
    resolveCreate(client)
    await ensuring
    await ending

    expect(create).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledTimes(1)
  })

  it("drop() usa String(err) quando a falha de client.end() não é um Error", async () => {
    const { client, end } = fakeClient()
    end.mockRejectedValueOnce("connection reset")
    const warn = vi.fn()
    const log = { warn } as unknown as AppLogger
    const factory = {
      create: () => Promise.resolve(client),
    } as unknown as DedicatedClientFactory
    const managed = new ManagedDedicatedClient(
      factory,
      "outbox-listen",
      undefined,
      log
    )
    await managed.ensure()

    await managed.drop("teste")

    expect(warn).toHaveBeenCalledWith(
      "db.dedicated_client_end_failed",
      expect.objectContaining({ err: "connection reset" })
    )
  })

  it("ensure() envolve rejeição não-Error da factory antes de reapresentar via backoff", async () => {
    const create = vi.fn().mockRejectedValueOnce("econnrefused")
    const factory = { create } as unknown as DedicatedClientFactory
    const managed = new ManagedDedicatedClient(factory, "outbox-listen")

    const first = await managed.ensure().catch((err: unknown) => err)
    const second = await managed.ensure().catch((err: unknown) => err)

    expect(first).toBeInstanceOf(Error)
    expect((first as Error).message).toBe("econnrefused")
    expect(second).toBe(first)
  })
})
