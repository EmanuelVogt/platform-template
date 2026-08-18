import { readdirSync, readFileSync } from "node:fs"
import { join, sep } from "node:path"

import { Cron } from "@nestjs/schedule"

import { MaintenanceJob } from "./maintenance-job.decorator"
import {
  MAINTENANCE_SCHEDULE,
  type MaintenanceJobName,
  type MaintenanceJobSpec,
} from "./maintenance-schedule"

jest.mock("@nestjs/schedule", () => ({
  Cron: jest.fn(() => (): void => undefined),
}))

const mutableSchedule = MAINTENANCE_SCHEDULE as unknown as Record<
  string,
  MaintenanceJobSpec
>
const TIMED_JOB = "timed-probe" as unknown as MaintenanceJobName

describe("MAINTENANCE_SCHEDULE", () => {
  // Colisão de lockId silencia um job para sempre: o advisory lock fica com
  // quem pegar primeiro e o outro nunca roda. Compartilhar é decisão — mora
  // aqui, declarada por grupo.
  it("lockId é único por job, salvo compartilhamento declarado", () => {
    const declaredShares = new Map<number, string[]>()
    const byLock = new Map<number, string[]>()
    for (const [name, spec] of Object.entries(MAINTENANCE_SCHEDULE)) {
      byLock.set(spec.lockId, [...(byLock.get(spec.lockId) ?? []), name])
    }
    const offenders = [...byLock.entries()]
      .filter(([, names]) => names.length > 1)
      .filter(([lockId, names]) => {
        const declared = declaredShares.get(lockId)
        return declared?.join() !== [...names].sort().join()
      })
      .map(([lockId, names]) => `${String(lockId)}: ${names.sort().join(", ")}`)
    expect(offenders).toEqual([])

    const stale = [...declaredShares.keys()].filter(
      (lockId) => (byLock.get(lockId) ?? []).length < 2
    )
    expect(stale).toEqual([])
  })

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
    // Nenhum job do base-set declara fuso; a entrada sintética exercita o ramo
    // sem carimbar um fuso arbitrário num job real.
    mutableSchedule[TIMED_JOB] = {
      cron: "0 6 * * *",
      lockId: 98,
      timeZone: "America/Sao_Paulo",
    }
    try {
      class Subject {
        @MaintenanceJob(TIMED_JOB)
        async run(): Promise<void> {
          await Promise.resolve()
        }
      }

      void Subject
      expect(Cron).toHaveBeenCalledWith("0 6 * * *", {
        name: TIMED_JOB,
        timeZone: "America/Sao_Paulo",
      })
    } finally {
      Reflect.deleteProperty(mutableSchedule, TIMED_JOB)
    }
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
  schedule: Readonly<Record<string, MaintenanceJobSpec>>,
  bodyFiles: JobBodyIndex,
  readSource: (file: string) => string
): string[] {
  return Object.entries(schedule)
    .filter(([, spec]) => spec.atomic === true)
    .flatMap(([name]) =>
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

  it("varredura resolve exatamente um arquivo de corpo por job do registro", () => {
    expect(sourceFiles().length).toBeGreaterThan(0)

    const unresolved = Object.keys(MAINTENANCE_SCHEDULE).filter(
      (name) => (bodyFiles.get(name) ?? []).length !== 1
    )
    expect(unresolved).toEqual([])
    expect(bodyFiles.size).toBe(Object.keys(MAINTENANCE_SCHEDULE).length)
  })

  it("nenhum job atômico do registro referencia outsideTransaction", () => {
    const offenders = atomicJobsUsingOutsideTransaction(
      MAINTENANCE_SCHEDULE,
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
        { "exemplo.purge": { cron: "0 3 * * *", lockId: 99, atomic: true } },
        bodyOf,
        withPort
      )
      expect(offenders).toHaveLength(1)
      expect(offenders[0]).toContain("exemplo.purge")
      expect(offenders[0]).toContain(FILE)
    })

    it("mesmo arquivo passa quando o job não é atômico", () => {
      const offenders = atomicJobsUsingOutsideTransaction(
        { "exemplo.purge": { cron: "0 3 * * *", lockId: 99 } },
        bodyOf,
        withPort
      )
      expect(offenders).toEqual([])
    })

    it("job atômico passa quando o arquivo não referencia a porta", () => {
      const offenders = atomicJobsUsingOutsideTransaction(
        { "exemplo.purge": { cron: "0 3 * * *", lockId: 99, atomic: true } },
        bodyOf,
        withoutPort
      )
      expect(offenders).toEqual([])
    })
  })
})
