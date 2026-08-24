import type { DedicatedClientFactory } from "./dedicated-client.factory"
import type { AppLogger } from "../../kernel/logging/logger.factory"
import type { Client } from "pg"

/** Espera mínima entre tentativas de conexão, herdada do re-LISTEN do outbox. */
export const RECONNECT_BACKOFF_MS = 1000

/**
 * Um client dedicado de vida longa que se refaz quando cai. `onReady` é o que
 * precisa valer em toda conexão nova (o `LISTEN` do outbox, por exemplo) e por
 * isso reexecuta a cada reconexão.
 */
export class ManagedDedicatedClient {
  private client: Client | null = null
  private usable = false
  private connecting: Promise<Client> | null = null
  private lastFailure: { at: number; error: Error } | null = null

  constructor(
    private readonly factory: DedicatedClientFactory,
    private readonly purpose: string,
    private readonly onReady?: (client: Client) => Promise<void>,
    private readonly log?: AppLogger
  ) {}

  async ensure(): Promise<Client> {
    if (this.client && this.usable) {
      return this.client
    }
    // Backoff sem timer: a falha recente é reapresentada em vez de martelar um
    // Postgres fora do ar — quem chama (poll do outbox, /ready) dá o ritmo.
    const failure = this.lastFailure
    if (failure && Date.now() - failure.at < RECONNECT_BACKOFF_MS) {
      throw failure.error
    }
    this.connecting ??= this.connect()
    try {
      const client = await this.connecting
      this.lastFailure = null
      return client
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.lastFailure = { at: Date.now(), error }
      throw error
    } finally {
      this.connecting = null
    }
  }

  async drop(reason: string): Promise<void> {
    const client = this.client
    this.client = null
    this.usable = false
    if (!client) {
      return
    }
    this.log?.warn("db.dedicated_client_drop", {
      purpose: this.purpose,
      reason,
    })
    try {
      await client.end()
    } catch (err) {
      this.log?.warn("db.dedicated_client_end_failed", {
        purpose: this.purpose,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async end(): Promise<void> {
    if (this.connecting) {
      await this.connecting.catch(() => undefined)
    }
    await this.drop("encerramento")
    this.lastFailure = null
  }

  private async connect(): Promise<Client> {
    // Encerrar antes de criar é a garantia "nunca dois vivos": a criação nunca é
    // alcançada com um client ainda em mãos.
    await this.drop("reconexão")
    const client = await this.factory.create(this.purpose)
    const invalidate = (): void => {
      this.invalidate(client)
    }
    client.on("error", invalidate)
    client.on("end", invalidate)
    this.client = client
    this.usable = true
    try {
      await this.onReady?.(client)
    } catch (err) {
      await this.drop("preparação falhou")
      throw err
    }
    return client
  }

  /**
   * Marca inutilizável sem encerrar: quem encerra é o `drop` da próxima
   * conexão, mantendo a ordem "encerra o velho, depois cria o novo".
   */
  private invalidate(client: Client): void {
    if (this.client !== client || !this.usable) {
      return
    }
    this.usable = false
    this.log?.warn("db.dedicated_client_lost", { purpose: this.purpose })
  }
}
