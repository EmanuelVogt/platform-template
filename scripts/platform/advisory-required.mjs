import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { EXIT_CODES } from "./lib/exit-codes.mjs"
import { parseAdvisory } from "./lib/frontmatter.mjs"
import { isMain } from "./lib/is-main.mjs"

// Lazy optional prefix: tenta primeiro o segmento único (entrada sem variante); só recua para o
// par "variant/entry" quando o segmento único não é seguido por um tier válido — assim uma
// entrada com tier aninhado na própria raiz (catalog/<entry>/api/api/**) resolve para <entry>,
// não para "<entry>/api".
const CODE_PATH_RE =
  /^catalog\/((?:[^/]+\/)??[^/]+)\/(api|web|migrations|parity)\//
const ADVISORY_PATH_RE = /^docs\/advisories\/ADV-.*\.md$/
const TRAILER_RE = /^Advisory: none — .+$/m

function touchedEntries(stagedFiles) {
  const entries = new Set()
  for (const file of stagedFiles) {
    const match = CODE_PATH_RE.exec(file)
    if (match) entries.add(match[1])
  }
  return entries
}

export function checkAdvisoryRequired({
  stagedFiles,
  commitMessage,
  stagedAdvisories,
}) {
  const entries = touchedEntries(stagedFiles)
  if (entries.size === 0) {
    return { ok: true }
  }
  if (TRAILER_RE.test(commitMessage)) {
    return { ok: true }
  }
  const coveredModules = new Set(
    stagedAdvisories.map((advisory) => advisory.module)
  )
  const missing = [...entries].filter((entry) => !coveredModules.has(entry))
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

export function checkAdvisoryRange({ commits }) {
  const failures = []
  for (const commit of commits) {
    const result = checkAdvisoryRequired({
      stagedFiles: commit.files,
      commitMessage: commit.message,
      stagedAdvisories: commit.advisories,
    })
    if (!result.ok) failures.push({ sha: commit.sha, missing: result.missing })
  }
  return failures.length === 0 ? { ok: true } : { ok: false, failures }
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" })
}

function readAdvisoriesAt(files, revPrefix) {
  return files
    .filter((file) => ADVISORY_PATH_RE.test(file))
    .flatMap((file) => {
      try {
        return [
          {
            path: file,
            module: parseAdvisory(git(["show", `${revPrefix}${file}`]), file)
              .module,
          },
        ]
      } catch {
        return []
      }
    })
}

function readStagedCommit(commitMessage) {
  const files = git(["diff", "--cached", "--name-only"])
    .split("\n")
    .filter(Boolean)
  return {
    sha: "staged",
    files,
    message: commitMessage,
    advisories: readAdvisoriesAt(files, ":"),
  }
}

function readRangeCommits(range) {
  return git(["rev-list", "--reverse", "--no-merges", range])
    .split("\n")
    .filter(Boolean)
    .map((sha) => {
      const files = git(["show", "--name-only", "--pretty=format:", sha])
        .split("\n")
        .filter(Boolean)
      return {
        sha,
        files,
        message: git(["log", "-1", "--pretty=%B", sha]),
        advisories: readAdvisoriesAt(files, `${sha}:`),
      }
    })
}

function report(failure) {
  const prefix = failure.sha === "staged" ? "" : `${failure.sha.slice(0, 9)} `
  process.stderr.write(
    `${prefix}advisory obrigatório ausente para: ${failure.missing.join(", ")}\n`
  )
}

if (isMain(import.meta.url, process.argv[1])) {
  const rangeFlag = process.argv.indexOf("--range")
  const commits =
    rangeFlag === -1
      ? [readStagedCommit(readFileSync(process.argv[2], "utf8"))]
      : readRangeCommits(process.argv[rangeFlag + 1])
  const result = checkAdvisoryRange({ commits })
  if (!result.ok) {
    result.failures.forEach(report)
    process.exit(EXIT_CODES.ADVISORY_INVALID)
  }
  process.exit(EXIT_CODES.OK)
}
