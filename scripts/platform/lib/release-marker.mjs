import { spawnSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { EXIT_CODES } from "./exit-codes.mjs"
import { isMain } from "./is-main.mjs"

// Mesmo padrão numérico de `STABLE_TAG` em template-version.mjs — a versão
// aceita aqui precisa ser exatamente a que aquela função aceitaria como tag.
const MARKER_SUBJECT = /^chore\(release\): v(\d+)\.(\d+)\.(\d+)$/
const MARKER_PREFIX = "chore(release):"
const ZERO_SHA = "0000000000000000000000000000000000000000"

export function parseMarkerSubject(subject) {
  const match = MARKER_SUBJECT.exec(subject)
  if (!match) {
    return {
      ok: false,
      reason: `assunto "${subject}" não bate com a gramática do marcador de release — esperado "chore(release): vX.Y.Z" (semver estável, sem prerelease, um espaço)`,
    }
  }
  return { ok: true, version: `${match[1]}.${match[2]}.${match[3]}` }
}

// Frouxo de propósito: o `if` do workflow usa o mesmo prefixo. Um filtro
// estrito aqui deixaria um marcador malformado passar batido pelo `if` e
// nunca chegar a `decideRelease`, que é quem falha alto (MARK-06).
export function isMarkerSubject(subject) {
  return subject.startsWith(MARKER_PREFIX)
}

function nonHeadSubjects(subjects, headSubject) {
  const rest = [...subjects]
  const index = rest.indexOf(headSubject)
  if (index !== -1) rest.splice(index, 1)
  return rest
}

// Precedência de falha fixada pelo spec: MARK-06 (head malformado) antes de
// MARK-07 (marcador não é o head) antes de MARK-08 (marcador altera
// arquivos) — não reordenar.
export function decideRelease({ headSubject, subjects, changedFiles }) {
  const headIsMarker = isMarkerSubject(headSubject)
  let parsedHead
  if (headIsMarker) {
    parsedHead = parseMarkerSubject(headSubject)
    if (!parsedHead.ok) return { action: "fail", reason: parsedHead.reason }
  }

  const earlierMarker = nonHeadSubjects(subjects, headSubject).find(
    isMarkerSubject
  )
  if (earlierMarker) {
    return {
      action: "fail",
      reason: `commit "${earlierMarker}" carrega um marcador de release mas não é o head do push — o marcador precisa ser o último commit enviado`,
    }
  }

  if (!headIsMarker) return { action: "skip" }

  if (changedFiles.length > 0) {
    return {
      action: "fail",
      reason: `o commit marcador "${headSubject}" alterou ${changedFiles.length} arquivo(s) — o marcador não pode carregar conteúdo`,
    }
  }

  return { action: "release", version: parsedHead.version }
}

function defaultExec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

function subjectsInRange({ exec, repoRoot, range }) {
  const result = exec("git", ["log", "--format=%s", range], { cwd: repoRoot })
  if (result.status !== 0) return undefined
  return result.stdout.split("\n").filter(Boolean)
}

// `before` some (primeiro push de um branch) ou mentiroso (force-push) —
// nesses casos o range direto não é resolvível; cai para HEAD~1..HEAD, que
// nunca falha o release por um range que não dá pra calcular (MARK-08 risk).
function resolveSubjects({ exec, repoRoot, before, sha }) {
  if (before !== ZERO_SHA) {
    const primary = subjectsInRange({
      exec,
      repoRoot,
      range: `${before}..${sha}`,
    })
    if (primary !== undefined) return primary
  }
  return subjectsInRange({ exec, repoRoot, range: "HEAD~1..HEAD" }) ?? []
}

export function decideFromGit({
  exec = defaultExec,
  repoRoot = process.cwd(),
  before = process.env.MARKER_BEFORE_SHA ?? ZERO_SHA,
  sha = process.env.GITHUB_SHA ?? "HEAD",
} = {}) {
  const headSubject = exec("git", ["log", "-1", "--format=%s"], {
    cwd: repoRoot,
  }).stdout.trim()
  const subjects = resolveSubjects({ exec, repoRoot, before, sha })
  const changedFiles = exec(
    "git",
    ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
    { cwd: repoRoot }
  )
    .stdout.split("\n")
    .filter(Boolean)
  return decideRelease({ headSubject, subjects, changedFiles })
}

export function writeGithubOutput(
  decision,
  outputPath = process.env.GITHUB_OUTPUT
) {
  if (!outputPath) return
  const version = decision.action === "release" ? decision.version : ""
  appendFileSync(
    outputPath,
    `release=${decision.action === "release"}\nversion=${version}\n`
  )
}

if (isMain(import.meta.url, process.argv[1])) {
  if (process.argv[2] === "--decide") {
    const decision = decideFromGit()
    writeGithubOutput(decision)
    if (decision.action === "fail") {
      process.stderr.write(`release-marker — ${decision.reason}\n`)
      process.exit(EXIT_CODES.USAGE_ERROR)
    }
    process.exit(EXIT_CODES.OK)
  }
}
