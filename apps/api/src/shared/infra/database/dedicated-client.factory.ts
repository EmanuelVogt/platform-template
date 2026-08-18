import { Injectable, type OnApplicationShutdown } from "@nestjs/common"
import { Client } from "pg"

import { env, type Env } from "../../config/env"

import { dedicatedApplicationName, dedicatedConfig } from "./connection-config"

import type { AppLogger } from "../../kernel/logging/logger.factory"

/**
 * Clients fora do pool para infra de longa duração (LISTEN do outbox, advisory
 * lock de job, verificação de /ready). Mesma config de conexão do pool, com
 * `application_name` próprio, e nenhum client sobrevivendo ao shutdown — assim
 * o pool de aplicação fica sem detentor permanente.
 */
@Injectable()
export class DedicatedClientFactory implements OnApplicationShutdown {
  private readonly live = new Map<Client, string>()

  constructor(
    private readonly log: AppLogger,
    private readonly config: Env = env()
  ) {}

  async create(purpose: string): Promise<Client> {
    const client = new Client(dedicatedConfig(purpose, this.config))
    // pg emite 'error' na morte inesperada da sessão: sem listener o
    // EventEmitter lança não-tratado e derruba o processo. Loga só err.message
    // (nunca o err inteiro nem a connectionString — evita vazar credencial).
    client.on("error", (err) => {
      this.log.error("db.dedicated_client_error", { purpose, err: err.message })
    })
    // Baixa pelo evento 'end' e não por wrapper de `end()`: cobre também a morte
    // server-side (pg_terminate_backend), em que ninguém chama `end()` e o
    // registro ficaria contando um client já morto.
    client.on("end", () => {
      this.live.delete(client)
    })
    await client.connect()
    this.live.set(client, dedicatedApplicationName(purpose))
    return client
  }

  liveCount(): number {
    return this.live.size
  }

  /**
   * Quebra por `application_name` — o mesmo que sai em `pg_stat_activity`, para
   * o rótulo do gráfico servir de filtro no banco durante um incidente.
   */
  liveCountByApplicationName(): ReadonlyMap<string, number> {
    const counts = new Map<string, number>()
    for (const name of this.live.values()) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return counts
  }

  async onApplicationShutdown(): Promise<void> {
    const remaining = [...this.live.keys()]
    this.live.clear()
    await Promise.all(remaining.map((client) => this.endQuietly(client)))
  }

  private async endQuietly(client: Client): Promise<void> {
    try {
      await client.end()
    } catch (err) {
      this.log.warn("db.dedicated_client_end_failed", {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
