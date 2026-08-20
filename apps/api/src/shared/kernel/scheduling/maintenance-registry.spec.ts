import { readdirSync, readFileSync } from "node:fs"
import { join, sep } from "node:path"

import { Cron } from "@nestjs/schedule"

import { MaintenanceJob } from "./maintenance-job.decorator"
import {
  KERNEL_MAINTENANCE_JOBS,
  MaintenanceRegistry,
  maintenanceRegistry,
  registerMaintenanceJob,
} from "./maintenance-registry"

import type { MaintenanceJobEntry } from "./maintenance-registry"

jest.mock("@nestjs/schedule", () => ({
  Cron: jest.fn(() => (): void => undefined),
}))

const KERNEL_JOB_NAMES: readonly string[] = KERNEL_MAINTENANCE_JOBS.map(
  (job) => job.name
)

describe("MaintenanceRegistry", () => {
  it("aceita jobs de nome e lockId distintos e devolve o spec registrado", () => {
    const registry = new MaintenanceRegistry()

    registry.register({ name: "alfa.purge", cron: "0 3 * * *", lockId: 41 })
    registry.register({
      name: "beta.purge",
      cron: "0 4 * * *",
      lockId: 42,
      atomic: true,
    })

    expect(registry.names()).toEqual(["alfa.purge", "beta.purge"])
    expect(registry.require("beta.purge")).toEqual({
      cron: "0 4 * * *",
      lockId: 42,
      atomic: true,
    })
  })

  it("nome duplicado lança e preserva o primeiro registro", () => {
    const registry = new MaintenanceRegistry()
    registry.register({ name: "alfa.purge", cron: "0 3 * * *", lockId: 41 })

    expect(() =>
      registry.register({ name: "alfa.purge", cron: "0 9 * * *", lockId: 42 })
    ).toThrow('Job de manutenção "alfa.purge" já registrado.')
    expect(registry.require("alfa.purge").cron).toBe("0 3 * * *")
  })

  it("lockId em colisão lança nomeando o dono e não registra o intruso", () => {
    const registry = new MaintenanceRegistry()
    registry.register({ name: "alfa.purge", cron: "0 3 * * *", lockId: 41 })

    expect(() =>
      registry.register({ name: "beta.purge", cron: "0 4 * * *", lockId: 41 })
    ).toThrow(
      'Job de manutenção "beta.purge" usa o lockId 41, já registrado por "alfa.purge".'
    )
    expect(registry.has("beta.purge")).toBe(false)
    expect(registry.names()).toEqual(["alfa.purge"])
  })

  it("lookup de nome não registrado lança", () => {
    expect(() => new MaintenanceRegistry().require("fantasma.purge")).toThrow(
      'Job de manutenção "fantasma.purge" não registrado'
    )
  })
})

describe("jobs do próprio kernel", () => {
  it("entram pelo mesmo registro, com cron e lockId preservados", () => {
    expect(maintenanceRegistry.require("outbox.purge")).toEqual({
      cron: "0 3 * * *",
      lockId: 1,
    })
    expect(maintenanceRegistry.require("idempotency.purge")).toEqual({
      cron: "15 3 * * *",
      lockId: 2,
    })
  })

  // Colisão de lockId silencia um job para sempre: o advisory lock fica com
  // quem pegar primeiro e o outro nunca roda.
  it("nenhum lockId repetido entre os jobs registrados no processo", () => {
    const byLock = new Map<number, string[]>()
    for (const { name, lockId } of maintenanceRegistry.entries()) {
      byLock.set(lockId, [...(byLock.get(lockId) ?? []), name])
    }
    const offenders = [...byLock.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([lockId, names]) => `${String(lockId)}: ${names.sort().join(", ")}`)

    expect(offenders).toEqual([])
  })
})

describe("@MaintenanceJob", () => {
  it("job sem fuso não declara timeZone nas opções do Cron", () => {
    jest.mocked(Cron).mockClear()

    class Subject {
      @MaintenanceJob("outbox.purge")
      async run(): Promise<void> {
        await Promise.resolve()
      }
    }

    void Subject
    expect(Cron).toHaveBeenCalledWith("0 3 * * *", { name: "outbox.purge" })
    const options = jest.mocked(Cron).mock.calls[0]?.[1]
    expect(options).toBeDefined()
    expect(options).not.toHaveProperty("timeZone")
  })

  it("job com fuso repassa timeZone nas opções do Cron", () => {
    jest.mocked(Cron).mockClear()
    // Nenhum job do kernel declara fuso; a entrada sintética exercita o ramo
    // sem carimbar um fuso arbitrário num job real.
    registerMaintenanceJob({
      name: "timed-probe",
      cron: "0 6 * * *",
      lockId: 98,
      timeZone: "America/Sao_Paulo",
    })

    class Subject {
      @MaintenanceJob("timed-probe")
      async run(): Promise<void> {
        await Promise.resolve()
      }
    }

    void Subject
    expect(Cron).toHaveBeenCalledWith("0 6 * * *", {
      name: "timed-probe",
      timeZone: "America/Sao_Paulo",
    })
  })

  it("aceita nome novo registrado fora do kernel, sem união fechada", () => {
    jest.mocked(Cron).mockClear()
    registerMaintenanceJob({
      name: "entrada-exemplo.purge",
      cron: "30 2 * * *",
      lockId: 97,
    })

    class Subject {
      @MaintenanceJob("entrada-exemplo.purge")
      async run(): Promise<void> {
        await Promise.resolve()
      }
    }

    void Subject
    expect(Cron).toHaveBeenCalledWith("30 2 * * *", {
      name: "entrada-exemplo.purge",
    })
  })

  it("nome não registrado lança na definição da classe", () => {
    expect(() => MaintenanceJob("nao-registrado.purge")).toThrow(
      'Job de manutenção "nao-registrado.purge" não registrado'
    )
  })
})

const SRC_DIR = join(__dirname, "..", "..", "..")
const DECORATOR = /^\s*@MaintenanceJob\(\s*"([^"]+)"/gm
const OUTSIDE_TX_MARKER = "outsideTransaction("

type JobBodyIndex = ReadonlyMap<string, readonly string[]>

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split(sep).join("/"))
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith("spec.ts"))
}

function indexJobBodyFiles(): JobBodyIndex {
  const index = new Map<string, string[]>()
  for (const rel of sourceFiles()) {
    const source = readFileSync(join(SRC_DIR, rel), "utf8")
    for (const [, name] of source.matchAll(DECORATOR)) {
      if (name === undefined) continue
      index.set(name, [...(index.get(name) ?? []), rel])
    }
  }
  return index
}

function atomicJobsUsingOutsideTransaction(
  entries: readonly MaintenanceJobEntry[],
  bodyFiles: JobBodyIndex,
  readSource: (file: string) => string
): string[] {
  return entries
    .filter((entry) => entry.atomic === true)
    .flatMap(({ name }) =>
      (bodyFiles.get(name) ?? []).map((file) => ({ name, file }))
    )
    .filter(({ file }) => readSource(file).includes(OUTSIDE_TX_MARKER))
    .map(({ name, file }) => `${name} → ${file}`)
}

// `atomic: true` põe o corpo dentro de uma transação do pool de aplicação, e
// `outsideTransaction()` lança se houver transação ativa — a combinação quebra
// em todo disparo. Nenhum job é atômico hoje, então a trava real não tem o que
// reprovar: quem prova que ela funciona são os casos sintéticos abaixo.
describe("job atômico não referencia a porta fora-de-tx", () => {
  const bodyFiles = indexJobBodyFiles()

  it("varredura resolve exatamente um arquivo de corpo por job do kernel", () => {
    expect(sourceFiles().length).toBeGreaterThan(0)

    const unresolved = KERNEL_JOB_NAMES.filter(
      (name) => (bodyFiles.get(name) ?? []).length !== 1
    )
    expect(unresolved).toEqual([])
    // Corpo de job de entrada do catálogo mora fora de `apps/api/src`, então a
    // varredura só enxerga — e só cobra — os jobs do próprio kernel. Um
    // `@MaintenanceJob` aqui dentro com nome fora do registro do kernel cai
    // nesta comparação.
    expect([...bodyFiles.keys()].sort()).toEqual([...KERNEL_JOB_NAMES].sort())
  })

  it("nenhum job atômico do kernel referencia outsideTransaction", () => {
    const offenders = atomicJobsUsingOutsideTransaction(
      KERNEL_MAINTENANCE_JOBS,
      bodyFiles,
      (file) => readFileSync(join(SRC_DIR, file), "utf8")
    )
    expect(offenders).toEqual([])
  })

  describe("prova sintética da trava", () => {
    const FILE = "modules/exemplo/application/jobs/exemplo-purge.job.ts"
    const bodyOf = new Map([["exemplo.purge", [FILE]]])
    const withPort = (): string =>
      "await this.txManager.outsideTransaction().delete(exemplos)"
    const withoutPort = (): string => "await this.repository.purge(limite)"

    it("job atômico com outsideTransaction reprova nomeando job e arquivo", () => {
      const offenders = atomicJobsUsingOutsideTransaction(
        [{ name: "exemplo.purge", cron: "0 3 * * *", lockId: 99, atomic: true }],
        bodyOf,
        withPort
      )
      expect(offenders).toHaveLength(1)
      expect(offenders[0]).toContain("exemplo.purge")
      expect(offenders[0]).toContain(FILE)
    })

    it("mesmo arquivo passa quando o job não é atômico", () => {
      const offenders = atomicJobsUsingOutsideTransaction(
        [{ name: "exemplo.purge", cron: "0 3 * * *", lockId: 99 }],
        bodyOf,
        withPort
      )
      expect(offenders).toEqual([])
    })

    it("job atômico passa quando o arquivo não referencia a porta", () => {
      const offenders = atomicJobsUsingOutsideTransaction(
        [{ name: "exemplo.purge", cron: "0 3 * * *", lockId: 99, atomic: true }],
        bodyOf,
        withoutPort
      )
      expect(offenders).toEqual([])
    })
  })
})
