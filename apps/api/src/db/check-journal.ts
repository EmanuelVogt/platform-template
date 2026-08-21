import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// O migrator só aplica entrada cujo `when` seja maior que o maior `created_at`
// já registrado no banco. Migration que entra na base com `when` retroativo
// passa a ser ignorada em todo boot dos ambientes que já foram além dela — em
// silêncio, para sempre. Foi o que travou a homologação em 2026-07 e o que este
// check existe para barrar antes do push.

const BASE_REF = "origin/main"
const JOURNAL_REPO_PATH = "apps/api/drizzle/migrations/meta/_journal.json"
const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "migrations")
const JOURNAL_PATH = join(MIGRATIONS_DIR, "meta", "_journal.json")

// Passo entre `when` consecutivos, seguindo o padrão das entradas recentes.
const WHEN_STEP = 10_000_000

export type JournalEntry = {
  readonly idx: number
  readonly when: number
  readonly tag: string
}

type BaselineReset = {
  readonly newBaseline: string
  readonly droppedTags: readonly string[]
}

function toEntry(value: unknown, position: number): JournalEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`entrada ${position} do journal não é um objeto`)
  }
  const { idx, when, tag } = value as Record<string, unknown>
  if (typeof idx !== "number" || typeof when !== "number" || typeof tag !== "string") {
    throw new Error(`entrada ${position} do journal não tem idx/when/tag válidos`)
  }
  return { idx, when, tag }
}

export function parseJournal(raw: string): JournalEntry[] {
  const data: unknown = JSON.parse(raw)
  if (typeof data !== "object" || data === null) {
    throw new Error("journal não é um objeto")
  }
  const { entries } = data as Record<string, unknown>
  if (!Array.isArray(entries)) {
    throw new Error("journal não tem a lista `entries`")
  }
  return entries.map(toEntry)
}

// Journal publicado na base. Ausente quando o ref não foi buscado ainda (clone
// raso, CI sem fetch) — nesse caso só as checagens locais rodam.
function readBaseEntries(): JournalEntry[] | null {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const raw = execFileSync("git", ["show", `${BASE_REF}:${JOURNAL_REPO_PATH}`], {
      encoding: "utf8",
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
    return parseJournal(raw)
  } catch {
    return null
  }
}

function checkFilePairing(entries: JournalEntry[], problems: string[]): void {
  const tags = new Set(entries.map((entry) => entry.tag))
  for (const entry of entries) {
    if (!existsSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`))) {
      problems.push(`${entry.tag}: está no journal mas o .sql não existe — o migrate quebra no boot`)
    }
  }
  const orphans = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.replace(/\.sql$/, ""))
    .filter((name) => !tags.has(name))
  for (const orphan of orphans) {
    problems.push(`${orphan}.sql: não está no journal — nunca vai rodar`)
  }
}

export function checkWhenOrdering(entries: JournalEntry[], problems: string[]): void {
  const byWhen = new Map<number, string>()
  for (const entry of entries) {
    const owner = byWhen.get(entry.when)
    if (owner !== undefined) {
      problems.push(
        `${entry.tag}: usa o when ${entry.when}, já ocupado por ${owner} — timestamp repetido faz uma das duas ser pulada`,
      )
      continue
    }
    byWhen.set(entry.when, entry.tag)
  }
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1]
    const current = entries[index]
    if (previous === undefined || current === undefined) continue
    if (current.when <= previous.when) {
      problems.push(
        `${current.tag}: when ${current.when} não é maior que o de ${previous.tag} (${previous.when}) — a ordem do journal precisa ser crescente`,
      )
    }
  }
}

// A regra contra a base pressupõe continuidade — o branch acrescenta a uma cadeia
// que os ambientes já rodaram. Num reset de baseline declarado a cadeia recomeça
// (o produto adota a nova base com `pnpm platform module adopt` em vez de migrar
// por cima), então não existe ambiente migrado cuja ordem pudesse ser violada.
// Os três sinais só coexistem num reset: baseline nova no idx 0, baseline da base
// sumida do branch, e cadeia publicada encolhida além dela. O terceiro é o que
// barra um mero renomeio da baseline, que satisfaz os dois primeiros sem recriar
// a base do zero.
export function detectBaselineReset(
  entries: readonly JournalEntry[],
  base: readonly JournalEntry[],
): BaselineReset | null {
  const branchBaseline = entries.find((entry) => entry.idx === 0)
  const baseBaseline = base.find((entry) => entry.idx === 0)
  if (branchBaseline === undefined || baseBaseline === undefined) return null

  const branchTags = new Set(entries.map((entry) => entry.tag))
  const baseTags = new Set(base.map((entry) => entry.tag))
  if (baseTags.has(branchBaseline.tag)) return null
  if (branchTags.has(baseBaseline.tag)) return null

  const droppedTags = base.filter((entry) => !branchTags.has(entry.tag)).map((entry) => entry.tag)
  const droppedBeyondBaseline = droppedTags.filter((tag) => tag !== baseBaseline.tag)
  if (droppedBeyondBaseline.length === 0) return null

  return { newBaseline: branchBaseline.tag, droppedTags }
}

// A checagem decisiva: migration nova precisa vir depois de tudo que já foi
// publicado, senão nasce no passado dos ambientes que já rodaram a base.
export function checkAgainstBase(
  entries: JournalEntry[],
  base: JournalEntry[],
  problems: string[],
  warnings: string[],
): void {
  const baseTags = new Set(base.map((entry) => entry.tag))
  const baseMaxWhen = Math.max(...base.map((entry) => entry.when))
  const added = entries.filter((entry) => !baseTags.has(entry.tag))
  const reset = detectBaselineReset(entries, base)
  let suggestion = baseMaxWhen

  if (reset === null) {
    for (const entry of added) {
      if (entry.when <= baseMaxWhen) {
        suggestion += WHEN_STEP
        problems.push(
          `${entry.tag}: when ${entry.when} não passa do último de ${BASE_REF} (${baseMaxWhen}). ` +
            `A migration nasceria no passado e seria ignorada para sempre nos ambientes já migrados. Use when ${suggestion}.`,
        )
      }
    }
  } else {
    warnings.push(
      `reset de baseline detectado: ${reset.newBaseline} substitui a baseline de ${BASE_REF} e ` +
        `${reset.droppedTags.length} entrada(s) publicada(s) sumiram (${reset.droppedTags.join(", ")}). ` +
        `A cadeia publicada recomeça em vez de continuar, então a regra de ordem contra ${BASE_REF} não se aplica e foi pulada.`,
    )
  }

  const baseDuplicateIdx = new Set<number>()
  const seenInBase = new Set<number>()
  for (const entry of base) {
    if (seenInBase.has(entry.idx)) baseDuplicateIdx.add(entry.idx)
    seenInBase.add(entry.idx)
  }
  // Duplicata herdada da base fica de fora: renomear migration já aplicada não
  // conserta nada (o migrator lê o `tag`, não o número) e só reescreve história.
  const seen = new Set<number>()
  for (const entry of entries) {
    if (seen.has(entry.idx) && !baseDuplicateIdx.has(entry.idx)) {
      problems.push(`${entry.tag}: o número ${entry.idx} já é de outra migration — renumere antes do merge`)
    }
    seen.add(entry.idx)
  }
}

function main(): void {
  const entries = parseJournal(readFileSync(JOURNAL_PATH, "utf8"))
  const problems: string[] = []
  const warnings: string[] = []

  checkFilePairing(entries, problems)
  checkWhenOrdering(entries, problems)

  const base = readBaseEntries()
  if (base === null) {
    warnings.push(`${BASE_REF} não encontrado — a checagem contra a base foi pulada (rode \`git fetch\`)`)
  } else {
    checkAgainstBase(entries, base, problems, warnings)
  }

  for (const warning of warnings) {
    console.warn(`[migrations] aviso: ${warning}`)
  }

  if (problems.length > 0) {
    console.error(`[migrations] ${problems.length} problema(s) no journal:`)
    for (const problem of problems) {
      console.error(`  - ${problem}`)
    }
    process.exitCode = 1
    return
  }

  console.info(`[migrations] journal ok — ${entries.length} migrations em ordem`)
}

// Só executa quando rodado direto (ts-node), não quando importado por teste.
if (require.main === module) {
  main()
}
