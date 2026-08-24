import { spawnSync } from "node:child_process"
import path from "node:path"
import { runPreflight as runReleasePreflight } from "../../release-preflight.mjs"
import { EXIT_CODES } from "../exit-codes.mjs"
import { readLatestChangelogVersion } from "../kernel-version.mjs"

function defaultExec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

// MARK-13: os dois checks abaixo rodam antes de qualquer outra coisa — nenhum
// commit pode existir quando o comando se recusa a rodar.
function refusalReason({ branch, statusOutput }) {
  if (branch !== "main") {
    return `release — HEAD não está em "main" (está em "${branch}")`
  }
  if (statusOutput.length > 0) {
    return "release — a árvore de trabalho tem alterações não commitadas"
  }
  return undefined
}

export async function planRelease({
  version,
  cwd = process.cwd(),
  exec = defaultExec,
  runPreflight = runReleasePreflight,
  log = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const branch = exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
  }).stdout.trim()
  const statusOutput = exec("git", ["status", "--porcelain"], {
    cwd,
  }).stdout.trim()

  const reason = refusalReason({ branch, statusOutput })
  if (reason) {
    log(reason)
    return EXIT_CODES.USAGE_ERROR
  }

  const resolvedVersion =
    version ??
    readLatestChangelogVersion(path.join(cwd, "docs/dev/template-changelog.md"))

  const preflightExit = await runPreflight({
    version: resolvedVersion,
    repoRoot: cwd,
    exec,
    log,
  })
  if (preflightExit !== EXIT_CODES.OK) return preflightExit

  // MARK-12: exatamente um commit vazio, nenhuma tag, nenhum push.
  exec(
    "git",
    ["commit", "--allow-empty", "-m", `chore(release): v${resolvedVersion}`],
    { cwd }
  )
  log("git push origin main")
  return EXIT_CODES.OK
}

export async function releaseCommand({
  version,
  cwd = process.cwd(),
  exec,
  runPreflight,
  log,
} = {}) {
  return planRelease({ version, cwd, exec, runPreflight, log })
}
