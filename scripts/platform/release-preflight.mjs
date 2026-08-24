import { spawnSync } from "node:child_process"
import path from "node:path"
import semver from "semver"
import { EXIT_CODES } from "./lib/exit-codes.mjs"
import { isMain } from "./lib/is-main.mjs"
import {
  lintChildMigrationSteps,
  readChangelogSection,
  readLatestChangelogVersion,
  sectionFirstParagraph,
} from "./lib/kernel-version.mjs"
import { discoverEntries } from "./lib/entries.mjs"
import { stableTagsFromLsRemote } from "./lib/template-version.mjs"

function defaultExec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

function changelogPathFor(repoRoot) {
  return path.join(repoRoot, "docs/dev/template-changelog.md")
}

// Tag anterior à que está sendo liberada: a mais recente que já existe no
// repositório (a tag de `version` ainda não existe — é checado antes desta
// chamada). Sem tag alguma, não há linha de base para o guard de entradas.
function previousStableTag({ repoRoot, exec }) {
  const result = exec(
    "git",
    ["ls-remote", "--tags", "--refs", repoRoot, "v*"],
    { cwd: repoRoot }
  )
  const tags = stableTagsFromLsRemote(result.stdout ?? "")
  return tags.at(-1)
}

function moduleVersionAt({ repoRoot, exec, ref, entryDir }) {
  const relDir = path.relative(repoRoot, entryDir)
  const result = exec("git", ["show", `${ref}:${relDir}/module.json`], {
    cwd: repoRoot,
  })
  if (result.status !== 0) return undefined
  try {
    return JSON.parse(result.stdout).version
  } catch {
    return undefined
  }
}

// REL-04: uma entrada cujo diretório mudou desde a tag anterior mas cujo
// `module.json.version` permanece igual é a classe de bug do issue #9
// (colisão em 2.0.0). Entradas novas (sem baseline na tag anterior) ficam
// de fora — não há "sem bump" possível pra algo que ainda não existia.
function entryChangedWithoutBump({ repoRoot, exec, previousTag, entryDir }) {
  const relDir = path.relative(repoRoot, entryDir)
  const diffResult = exec(
    "git",
    ["diff", "--quiet", previousTag, "HEAD", "--", relDir],
    { cwd: repoRoot }
  )
  if (diffResult.status === 0) return false
  const previousVersion = moduleVersionAt({
    repoRoot,
    exec,
    ref: previousTag,
    entryDir,
  })
  if (previousVersion === undefined) return false
  const currentVersion = moduleVersionAt({
    repoRoot,
    exec,
    ref: "HEAD",
    entryDir,
  })
  return currentVersion !== undefined && currentVersion === previousVersion
}

export async function runPreflight({
  version,
  repoRoot = process.cwd(),
  exec = defaultExec,
  log = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const changelogPath = changelogPathFor(repoRoot)

  let latest
  try {
    latest = readLatestChangelogVersion(changelogPath)
  } catch (err) {
    log(`release-preflight — ${err.message}`)
    return EXIT_CODES.USAGE_ERROR
  }
  if (version !== latest) {
    log(
      `release-preflight — versão "${version}" não é a última seção do changelog ("${latest}")`
    )
    return EXIT_CODES.USAGE_ERROR
  }

  const tagCheck = exec("git", ["tag", "-l", `v${version}`], { cwd: repoRoot })
  if (tagCheck.stdout.trim().length > 0) {
    log(
      `release-preflight — a tag "v${version}" já existe (nada novo para liberar)`
    )
    return EXIT_CODES.ALREADY_INSTALLED
  }

  const previousTag = previousStableTag({ repoRoot, exec })
  if (previousTag) {
    for (const entryDir of discoverEntries(path.join(repoRoot, "catalog"))) {
      if (entryChangedWithoutBump({ repoRoot, exec, previousTag, entryDir })) {
        const relDir = path.relative(repoRoot, entryDir)
        log(
          `release-preflight — a entrada "${relDir}" mudou desde ${previousTag} sem bump de versão em module.json`
        )
        return EXIT_CODES.TEST_FAILURE
      }
    }
  }

  const isMajor = semver.minor(version) === 0 && semver.patch(version) === 0
  if (!isMajor) {
    const section = readChangelogSection(changelogPath, version)
    const lintResult = lintChildMigrationSteps(section, version)
    if (!lintResult.ok) {
      log(`release-preflight — ${lintResult.reason}`)
      return EXIT_CODES.MIGRATION_FAILURE
    }
  }

  log(`release-preflight — OK: v${version} pode ser tagueada`)
  return EXIT_CODES.OK
}

// Usado por `release.yml` para a mensagem da tag anotada (`git tag -a -m`).
export function preflightMessage({ version, repoRoot = process.cwd() } = {}) {
  const section = readChangelogSection(changelogPathFor(repoRoot), version)
  return sectionFirstParagraph(section)
}

if (isMain(import.meta.url, process.argv[1])) {
  const argv = process.argv.slice(2)
  const messageIndex = argv.indexOf("--message")
  if (messageIndex !== -1) {
    process.stdout.write(
      `${preflightMessage({ version: argv[messageIndex + 1] })}\n`
    )
    process.exit(EXIT_CODES.OK)
  } else {
    const exitCode = await runPreflight({ version: argv[0] })
    process.exit(exitCode ?? EXIT_CODES.OK)
  }
}
