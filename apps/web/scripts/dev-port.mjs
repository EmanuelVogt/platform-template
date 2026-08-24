import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, statSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const MAIN_PORT = 5173
const WORKTREE_PORT_BASE = 5200
const WORKTREE_PORT_RANGE = 50

function findRepoRoot() {
  let dir = process.cwd()

  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir
    dir = path.dirname(dir)
  }

  return null
}

// Worktree linkado tem `.git` como arquivo apontando pro repo principal, que mantém `.git` como diretório.
function isLinkedWorktree(repoRoot) {
  try {
    return statSync(path.join(repoRoot, ".git")).isFile()
  } catch {
    return false
  }
}

export function resolveDevPort() {
  const repoRoot = findRepoRoot()
  if (!repoRoot || !isLinkedWorktree(repoRoot)) return MAIN_PORT

  const digest = createHash("sha1").update(repoRoot).digest()
  return WORKTREE_PORT_BASE + (digest[0] % WORKTREE_PORT_RANGE)
}

function run(file, args) {
  try {
    return execFileSync(file, args, { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

export function freeDevPort() {
  const port = resolveDevPort()
  const pids = run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"])
    .split("\n")
    .filter(Boolean)

  for (const pid of pids) {
    if (!run("ps", ["-o", "command=", "-p", pid]).includes("vite")) {
      console.error(
        `Porta ${port} ocupada por processo que não é do Vite (pid ${pid}). Libere manualmente.`
      )
      process.exit(1)
    }

    process.kill(Number(pid), "SIGTERM")
    console.info(`Servidor anterior derrubado na porta ${port} (pid ${pid}).`)
  }

  return port
}

const isEntrypoint =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntrypoint) {
  console.info(process.argv[2] === "--free" ? freeDevPort() : resolveDevPort())
}
