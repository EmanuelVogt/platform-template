import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { runPreflight as runReleasePreflight } from "../../release-preflight.mjs"
import { EXIT_CODES } from "../exit-codes.mjs"
import { readLatestChangelogVersion } from "../kernel-version.mjs"

// `parseArgs` aceita qualquer `--x` em silêncio, então sem esta lista uma flag
// desconhecida cai no caminho default e corta uma release: foi assim que o
// marcador da v2.3.0 nasceu, de um `release --help`.
export const RELEASE_FLAGS = Object.freeze(["push", "help"])

export const RELEASE_USAGE = [
  "uso: pnpm platform release [versão] [--push]",
  "",
  "  versão   x.y.z; sem argumento, usa a última seção do changelog",
  "  --push   empurra o marcador para main (o push é o gatilho do release.yml)",
  "",
  "Cria um commit vazio `chore(release): vX.Y.Z` e nunca cria tags: a tag é",
  "sempre ato do release.yml.",
].join("\n")

export function unknownReleaseFlags(options = {}) {
  return Object.keys(options).filter((flag) => !RELEASE_FLAGS.includes(flag))
}

function defaultExec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

// MARK-13: os checks abaixo rodam antes de qualquer outra coisa — nenhum commit
// pode existir quando o comando se recusa a rodar.
function refusalReason({ branch, statusOutput, isTemplate }) {
  // O CLI da plataforma vai para o produto gerado, e este subcomando vai junto
  // (o `cli.mjs` o importa estaticamente, então excluí-lo quebraria o import).
  // `catalog/` só existe no template — mesma sonda do job `detect` do ci.yml.
  // Sem esta guarda, `--push` num produto empurraria a main, que lá é deploy.
  if (!isTemplate) {
    return "release — comando exclusivo do template (não há `catalog/` aqui); um produto não corta tags da plataforma"
  }
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
  push = false,
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

  const reason = refusalReason({
    branch,
    statusOutput,
    isTemplate: existsSync(path.join(cwd, "catalog")),
  })
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

  // MARK-12: exatamente um commit vazio e nenhuma tag — a tag é sempre da CI.
  exec(
    "git",
    ["commit", "--allow-empty", "-m", `chore(release): v${resolvedVersion}`],
    { cwd }
  )

  if (!push) {
    log("git push origin main")
    return EXIT_CODES.OK
  }

  // O push é o gatilho do release.yml: falhar aqui deixa o marcador local sem
  // nenhuma tag disparada, e o operador precisa saber disso pelo exit code.
  const pushResult = exec("git", ["push", "origin", "main"], { cwd })
  if (pushResult.status !== 0) {
    log(
      "release — marcador criado, mas `git push origin main` falhou; nenhuma tag foi disparada"
    )
    return EXIT_CODES.PUSH_FAILED
  }

  log(`release — marcador v${resolvedVersion} empurrado; a tag sai do gate`)
  return EXIT_CODES.OK
}

export async function releaseCommand({
  version,
  push,
  cwd = process.cwd(),
  exec,
  runPreflight,
  log,
} = {}) {
  return planRelease({ version, push, cwd, exec, runPreflight, log })
}
