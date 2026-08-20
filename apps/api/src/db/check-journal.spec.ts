import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { checkAgainstBase, parseJournal } from "./check-journal"

import type { JournalEntry } from "./check-journal"

// Journal publicado em origin/main na v0.2, transcrito: a cadeia que o reset de
// baseline da v1 substitui. Maior `when` = 1797072480194 (0005).
const BASE: JournalEntry[] = [
  { idx: 0, when: 1787062300194, tag: "0000_platform_baseline" },
  { idx: 1, when: 1787062360194, tag: "0001_kernel_outbox_notify" },
  { idx: 2, when: 1787062420194, tag: "0002_auth_events_append_only" },
  { idx: 3, when: 1787062480194, tag: "0003_audit_trail" },
  { idx: 4, when: 1797062480194, tag: "0004_identity_serves_clients" },
  { idx: 5, when: 1797072480194, tag: "0005_attachment_generic_upload_profiles" },
]

const BASE_MAX_WHEN = 1797072480194

function run(entries: JournalEntry[]): { problems: string[]; warnings: string[] } {
  const problems: string[] = []
  const warnings: string[] = []
  checkAgainstBase(entries, BASE, problems, warnings)
  return { problems, warnings }
}

function branchJournal(): JournalEntry[] {
  const path = resolve(__dirname, "..", "..", "drizzle", "migrations", "meta", "_journal.json")
  return parseJournal(readFileSync(path, "utf8"))
}

describe("check-journal — ordem contra a base", () => {
  it("append com when abaixo do máximo da base falha, com mensagem e sugestão intactas", () => {
    const { problems, warnings } = run([
      ...BASE,
      { idx: 6, when: BASE_MAX_WHEN - 1, tag: "0006_nova" },
    ])

    expect(problems).toEqual([
      `0006_nova: when ${BASE_MAX_WHEN - 1} não passa do último de origin/main (${BASE_MAX_WHEN}). ` +
        "A migration nasceria no passado e seria ignorada para sempre nos ambientes já migrados. " +
        "Use when 1797082480194.",
    ])
    expect(warnings).toEqual([])
  })

  it("append com when acima do máximo da base passa", () => {
    const { problems, warnings } = run([
      ...BASE,
      { idx: 6, when: BASE_MAX_WHEN + 1, tag: "0006_nova" },
    ])

    expect(problems).toEqual([])
    expect(warnings).toEqual([])
  })
})

describe("check-journal — isenção de reset de baseline", () => {
  it("reset deste branch passa e avisa quais entradas publicadas sumiram", () => {
    const entries = branchJournal()
    expect(entries.map((entry) => entry.tag)).toEqual([
      "0000_kernel_baseline",
      "0001_kernel_outbox_notify",
    ])
    expect(entries.every((entry) => entry.when < BASE_MAX_WHEN)).toBe(true)

    const { problems, warnings } = run(entries)

    expect(problems).toEqual([])
    expect(warnings).toEqual([
      "reset de baseline detectado: 0000_kernel_baseline substitui a baseline de origin/main e " +
        "5 entrada(s) publicada(s) sumiram (0000_platform_baseline, 0002_auth_events_append_only, " +
        "0003_audit_trail, 0004_identity_serves_clients, 0005_attachment_generic_upload_profiles). " +
        "A cadeia publicada recomeça em vez de continuar, então a regra de ordem contra origin/main " +
        "não se aplica e foi pulada.",
    ])
  })

  it("baseline nova por cima da base inteira é append, não reset — segue falhando", () => {
    const { problems, warnings } = run([
      { idx: 0, when: 1787062300000, tag: "0000_kernel_baseline" },
      ...BASE.map((entry) => ({ ...entry, idx: entry.idx + 1 })),
    ])

    expect(warnings).toEqual([])
    expect(problems).toEqual([
      `0000_kernel_baseline: when 1787062300000 não passa do último de origin/main (${BASE_MAX_WHEN}). ` +
        "A migration nasceria no passado e seria ignorada para sempre nos ambientes já migrados. " +
        "Use when 1797082480194.",
    ])
  })

  it("renomear só a baseline não é reset — segue falhando", () => {
    const renamed = BASE.map((entry) =>
      entry.idx === 0 ? { ...entry, tag: "0000_kernel_baseline" } : entry,
    )

    const { problems, warnings } = run(renamed)

    expect(warnings).toEqual([])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("0000_kernel_baseline: when 1787062300194 não passa do último")
  })
})
