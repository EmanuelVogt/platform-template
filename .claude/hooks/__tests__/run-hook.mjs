// Test harness for .claude/hooks/*.mjs — spawns each hook exactly as Claude Code
// does (stdin JSON, CLAUDE_PROJECT_DIR env, exit code) instead of importing hook
// internals, so tests exercise the real process contract. Harness tooling — not
// app code.
import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const HOOKS_DIR = fileURLToPath(new URL("..", import.meta.url))
const CLAUDE_DIR = fileURLToPath(new URL("../..", import.meta.url))

const resolveHookPath = (name) =>
  name === "statusline"
    ? join(CLAUDE_DIR, "statusline.mjs")
    : join(HOOKS_DIR, `${name}.mjs`)

// git exports GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE into pre-push hooks; inherited by the
// fixture and the hook under test they would point both at the real repo, not the fixture.
export const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
)

export function runHook(name, input, { env = {}, cwd, args = [] } = {}) {
  const result = spawnSync(process.execPath, [resolveHookPath(name), ...args], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...baseEnv, ...env },
    cwd,
    encoding: "utf8",
  })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

const STANDING_RULES_SECTION = `## Two standing rules

**Think and work in English; answer the user in pt-BR.**

**Disk is the source of truth for what exists.**
`

export function makeFixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), "platform-hook-fixture-"))

  writeFileSync(
    join(dir, "AGENTS.md"),
    `# Fixture repo\n\n${STANDING_RULES_SECTION}`
  )
  symlinkSync("AGENTS.md", join(dir, "CLAUDE.md"))

  spawnSync("git", ["init", "-q"], { cwd: dir, env: baseEnv })

  mkdirSync(join(dir, ".worktrees", "x"), { recursive: true })
  writeFileSync(
    join(dir, ".worktrees", "x", ".git"),
    "gitdir: ../../.git/worktrees/x\n"
  )

  mkdirSync(join(dir, "apps", "api", "src"), { recursive: true })
  writeFileSync(join(dir, "apps", "api", "src", "main.ts"), "export {}\n")
  writeFileSync(join(dir, "openapi.json"), JSON.stringify({ paths: {} }))

  writeFileSync(join(dir, "big.json"), "x".repeat(101_000))
  writeFileSync(join(dir, "small.ts"), "export const filler = 1\n".repeat(400))

  const usageEntry = {
    type: "assistant",
    message: {
      usage: {
        input_tokens: 100,
        cache_read_input_tokens: 4500,
        cache_creation_input_tokens: 200,
        output_tokens: 50,
      },
    },
  }
  writeFileSync(
    join(dir, "transcript.jsonl"),
    `${JSON.stringify(usageEntry)}\n`
  )

  mkdirSync(join(dir, ".specs"), { recursive: true })
  writeFileSync(join(dir, ".specs", "feature.md"), "# fixture\n")
  mkdirSync(join(dir, ".ca-plans", "fixture"), { recursive: true })
  writeFileSync(join(dir, ".ca-plans", "fixture", "plan.md"), "# fixture\n")
  mkdirSync(join(dir, ".claude", "hooks"), { recursive: true })

  return dir
}

export function removeFixtureRepo(dir) {
  rmSync(dir, { recursive: true, force: true })
}

export function uniqueSessionId(label) {
  return `${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const STATE_KEYS = ["comment-policy", "design-system"]

export function cleanupSessionState(sessionId) {
  const candidates = [
    join(tmpdir(), `platform-tripwires-${sessionId}`),
    join(tmpdir(), `platform-context-checkpoint-${sessionId}`),
    join(tmpdir(), `platform-delegate-${sessionId}.json`),
    join(tmpdir(), `platform-claim-evidence-${sessionId}`),
    join(tmpdir(), `platform-wave-${sessionId}.json`),
    ...STATE_KEYS.map((key) =>
      join(tmpdir(), `platform-reminder-${sessionId}-${key}`)
    ),
  ]
  for (const path of candidates) {
    try {
      rmSync(path, { force: true })
    } catch {
      // best-effort cleanup only
    }
  }
}
