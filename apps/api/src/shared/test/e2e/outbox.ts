import { OutboxDispatcher } from "../../kernel/outbox/outbox.dispatcher"

import { waitFor } from "./wait-for"

import type { INestApplication } from "@nestjs/common"

/** Qualquer despachante que o teste queira girar — o kernel só conhece o seu. */
export type Pollable = { poll: () => Promise<void> }

export type DrainOutboxOptions<T> = {
  /**
   * Despachantes a girar a cada volta. O default é só o `OutboxDispatcher` do
   * kernel: um módulo passa o seu (`DELIVERY_DISPATCHERS(app)`) para o kernel
   * nunca nomear despachante de módulo.
   */
  dispatchers?: Pollable[]
  until?: () => Promise<T | undefined> | T | undefined
  timeoutMs?: number
  intervalMs?: number
}

/**
 * Gira o outbox até o efeito aparecer. Sem `until`, dá uma volta em cada
 * despachante e volta — é a diferença entre esperar um efeito e dormir.
 */
export async function drainOutbox<T>(
  app: INestApplication,
  opts: DrainOutboxOptions<T> = {}
): Promise<T | undefined> {
  const dispatchers = opts.dispatchers ?? [app.get(OutboxDispatcher)]
  const pollAll = async (): Promise<void> => {
    for (const dispatcher of dispatchers) await dispatcher.poll()
  }
  if (opts.until === undefined) {
    await pollAll()
    return undefined
  }
  const until = opts.until
  return waitFor<T>(
    async () => {
      await pollAll()
      return until()
    },
    {
      timeoutMs: opts.timeoutMs ?? 5_000,
      intervalMs: opts.intervalMs ?? 25,
      label: "o efeito do outbox",
    }
  )
}
