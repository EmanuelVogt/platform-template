export type MaintenanceJobSpec = {
  readonly cron: string
  /** Único por job **entre os dois modos**: o espaço de advisory lock do
   * Postgres é compartilhado entre xact e session locks. */
  readonly lockId: number
  /** `true` = corpo roda numa transação do pool de aplicação, aberta DEPOIS do
   * lock. Ausente = o corpo abre as próprias transações. */
  readonly atomic?: boolean
  /** Fuso IANA do cron. Ausente = UTC. */
  readonly timeZone?: string
}

/** Espaço de nomes aberto: kernel e entradas do catálogo registram no mesmo
 * registro, então nenhuma união fechada pode descrevê-lo. */
export type MaintenanceJobName = string

export type MaintenanceJobEntry = MaintenanceJobSpec & {
  readonly name: MaintenanceJobName
}

/**
 * Registro dos jobs de manutenção, preenchido no boot. `lockId` em colisão
 * lança porque colisão silencia um job para sempre: o advisory lock fica com
 * quem pegar primeiro e o outro nunca roda.
 */
export class MaintenanceRegistry {
  private readonly specs = new Map<MaintenanceJobName, MaintenanceJobSpec>()
  private readonly lockOwners = new Map<number, MaintenanceJobName>()

  register({ name, ...spec }: MaintenanceJobEntry): void {
    if (this.specs.has(name)) {
      throw new Error(`Job de manutenção "${name}" já registrado.`)
    }
    const owner = this.lockOwners.get(spec.lockId)
    if (owner !== undefined) {
      throw new Error(
        `Job de manutenção "${name}" usa o lockId ${String(spec.lockId)}, já registrado por "${owner}".`
      )
    }
    this.specs.set(name, spec)
    this.lockOwners.set(spec.lockId, name)
  }

  require(name: MaintenanceJobName): MaintenanceJobSpec {
    const spec = this.specs.get(name)
    if (spec === undefined) {
      throw new Error(
        `Job de manutenção "${name}" não registrado: chame registerMaintenanceJob antes de declarar a classe do job.`
      )
    }
    return spec
  }

  has(name: MaintenanceJobName): boolean {
    return this.specs.has(name)
  }

  names(): MaintenanceJobName[] {
    return [...this.specs.keys()]
  }

  entries(): MaintenanceJobEntry[] {
    return [...this.specs].map(([name, spec]) => ({ name, ...spec }))
  }
}

/**
 * Instância de processo: `@MaintenanceJob` roda na definição da classe, antes
 * de existir container Nest, então o registro é alcançado por aqui — mesmo
 * idioma do `MaintenanceRuntime`. Caminho único de lookup: não há cópia na DI.
 */
export const maintenanceRegistry = new MaintenanceRegistry()

/** Chamar no topo do arquivo do job, ACIMA da classe: o decorator lê o spec na
 * definição da classe. Nenhum arquivo do kernel muda para um job novo entrar. */
export function registerMaintenanceJob(entry: MaintenanceJobEntry): void {
  maintenanceRegistry.register(entry)
}

/**
 * Os jobs do próprio kernel registram neste arquivo, não no de cada job,
 * porque `@MaintenanceJob` importa este módulo: o grafo de imports garante que
 * já estejam registrados quando a classe decorada é avaliada.
 */
export const KERNEL_MAINTENANCE_JOBS = [
  { name: "outbox.purge", cron: "0 3 * * *", lockId: 1 },
  { name: "idempotency.purge", cron: "15 3 * * *", lockId: 2 },
] as const satisfies readonly MaintenanceJobEntry[]

for (const job of KERNEL_MAINTENANCE_JOBS) {
  registerMaintenanceJob(job)
}
