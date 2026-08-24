import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  AdvisoryParseError,
  isAdvisoryFilename,
  parseAdvisory,
} from "./advisories.mjs"
import { expandGitShorthand } from "./catalog-source.mjs"

export class FeedUnreachableError extends Error {
  constructor(source, reason) {
    super(`feed do template inacessível: ${source} — ${reason}`)
    this.name = "FeedUnreachableError"
    this.source = source
  }
}

function hashRef(ref) {
  return createHash("sha1").update(ref).digest("hex").slice(0, 12)
}

function cacheFilePath(cacheRoot, source, tag) {
  return path.join(
    cacheRoot,
    `platform-template-feed-${hashRef(`${source}#${tag}`)}.json`
  )
}

function readValidCache(cacheFile, source, tag, ttlMs, now) {
  if (!existsSync(cacheFile)) return undefined
  try {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8"))
    if (
      cached.source === source &&
      cached.tag === tag &&
      now - cached.fetchedAt < ttlMs
    ) {
      return cached
    }
  } catch {
    // cache corrompido vale o mesmo que ausente — a chamada refaz o fetch.
  }
  return undefined
}

// Mesma varredura de `loadAdvisories`, mas sem interromper no primeiro arquivo
// inválido: um advisory do template na tag remota que não parseia não pode
// derrubar a sessão do hook (FEED edge) — vira entrada de `skipped`.
function parseAdvisoriesDir(dir) {
  const advisories = []
  const skipped = []
  if (!existsSync(dir)) return { advisories, skipped }
  for (const entry of readdirSync(dir).filter(isAdvisoryFilename).sort()) {
    const filePath = path.join(dir, entry)
    try {
      advisories.push(parseAdvisory(readFileSync(filePath, "utf8"), filePath))
    } catch (err) {
      if (!(err instanceof AdvisoryParseError)) throw err
      skipped.push({ file: entry, reason: err.message })
    }
  }
  return { advisories, skipped }
}

export function fetchRemoteAdvisories(
  source,
  tag,
  {
    cacheRoot = tmpdir(),
    ttlMs = 24 * 60 * 60 * 1000,
    timeoutMs = 8000,
    exec = execFileSync,
    now = Date.now(),
  } = {}
) {
  const cacheFile = cacheFilePath(cacheRoot, source, tag)
  const cached = readValidCache(cacheFile, source, tag, ttlMs, now)
  if (cached) {
    return {
      tag,
      tagDate: cached.tagDate,
      advisories: cached.advisories,
      skipped: cached.skipped,
      fromCache: true,
    }
  }

  const dest = mkdtempSync(path.join(tmpdir(), "platform-template-feed-clone-"))
  try {
    exec(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--sparse",
        "--branch",
        tag,
        expandGitShorthand(source),
        dest,
      ],
      { stdio: "pipe", timeout: timeoutMs }
    )
    exec("git", ["sparse-checkout", "set", "docs/advisories"], {
      cwd: dest,
      stdio: "pipe",
      timeout: timeoutMs,
    })
    const tagDate = String(
      exec("git", ["log", "-1", "--format=%cI"], {
        cwd: dest,
        stdio: "pipe",
        encoding: "utf8",
        timeout: timeoutMs,
      })
    ).trim()

    const { advisories, skipped } = parseAdvisoriesDir(
      path.join(dest, "docs", "advisories")
    )

    mkdirSync(cacheRoot, { recursive: true })
    writeFileSync(
      cacheFile,
      JSON.stringify({
        source,
        tag,
        tagDate,
        advisories,
        skipped,
        fetchedAt: now,
      })
    )

    return { tag, tagDate, advisories, skipped, fromCache: false }
  } catch (err) {
    throw new FeedUnreachableError(source, err.message)
  } finally {
    rmSync(dest, { recursive: true, force: true })
  }
}

// Junta advisories locais e remotos por id; o remoto vence em caso de duplicata
// (FEED-01) — é a versão mais recente, publicada na tag latest do template.
export function mergeAdvisories(local, remote) {
  const byId = new Map()
  for (const advisory of local) byId.set(advisory.id, advisory)
  for (const advisory of remote) byId.set(advisory.id, advisory)
  return [...byId.values()]
}
