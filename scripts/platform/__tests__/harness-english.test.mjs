import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const HOOK_PATH = path.join(
  REPO_ROOT,
  ".claude",
  "hooks",
  "plans-in-english.mjs"
)

function runHook(payload) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, PLATFORM_SPECS_LANG_OFF: "" },
  })
  return { status: result.status, stderr: result.stderr }
}

const write = (file_path, content) => ({
  tool_name: "Write",
  tool_input: { file_path, content },
})

const PT_PROSE =
  "Esta mudança não é compatível com o que discutimos antes, então precisamos revisar tudo de novo porque o time inteiro depende disso para continuar o trabalho."

test("scope: .ca-plans/**, .agents/skills/** and AGENTS.md.jinja block pt-BR prose", () => {
  assert.equal(
    runHook(write(path.join(REPO_ROOT, ".ca-plans", "x.md"), PT_PROSE)).status,
    2
  )
  assert.equal(
    runHook(
      write(
        path.join(REPO_ROOT, ".agents", "skills", "dev-workflow", "SKILL.md"),
        PT_PROSE
      )
    ).status,
    2
  )
  assert.equal(
    runHook(write(path.join(REPO_ROOT, "AGENTS.md.jinja"), PT_PROSE)).status,
    2
  )
})

test("scope: paths outside .ca-plans/**, .agents/skills/** and AGENTS.md.jinja never fire, even on pt-BR content", () => {
  assert.equal(
    runHook(write(path.join(REPO_ROOT, "docs", "dev", "x.md"), PT_PROSE))
      .status,
    0
  )
  assert.equal(
    runHook(
      write(path.join(REPO_ROOT, "apps", "api", "src", "main.ts"), PT_PROSE)
    ).status,
    0
  )
  // .claude/** is not live-enforced by the hook (only swept statically below,
  // per AC-06) — the router and the skill set are the two shipped-harness
  // roots this hook itself guards.
  assert.equal(
    runHook(
      write(path.join(REPO_ROOT, ".claude", "hooks", "some-hook.mjs"), PT_PROSE)
    ).status,
    0
  )
})

// AC-06 proof: no pt-BR remnants in the shipped harness (`.agents/skills/**`,
// `.claude/**`, AGENTS.md). Reuses the hook itself as the sole detection
// list — never re-declares PT_STOPWORDS/thresholds here, so the sweep can
// never drift from what the hook actually blocks live. Each candidate file's
// real content is probed through a synthetic in-scope `.ca-plans/` path,
// which forces the hook to evaluate it regardless of the file's true
// location (`.claude/**` isn't live-enforced, per the scope test above, but
// AC-06 still requires it to read as English).

// The hook's own source necessarily contains its pt-BR detection list
// (PT_STOPWORDS) as literal data, not prose — sweeping it would flag itself.
const SELF_REFERENCE = HOOK_PATH
// Historical, immutable ledger — same reasoning as HANDBOOK_EXCLUDED in
// hook-references.test.mjs; entries from past versions are not current-state
// harness text.
const PT_SWEEP_EXCLUDED = [
  path.join(REPO_ROOT, "docs", "dev", "template-changelog.md"),
]

function listTextFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    // Symlinked skill mirrors under .claude/skills/ resolve to
    // .agents/skills/** (already swept); readdirSync's dirent does not
    // follow symlinks, so isDirectory()/isFile() are both false for them
    // and they are skipped here without special-casing the path.
    if (entry.isDirectory()) files.push(...listTextFiles(full))
    else if (entry.isFile() && !full.endsWith(".json")) files.push(full)
  }
  return files
}

function shippedHarnessTextFiles() {
  const files = [
    ...listTextFiles(path.join(REPO_ROOT, ".agents", "skills")),
    ...listTextFiles(path.join(REPO_ROOT, ".claude", "hooks")),
    ...listTextFiles(path.join(REPO_ROOT, ".claude", "agents")),
    path.join(REPO_ROOT, "AGENTS.md.jinja"),
  ]
  return files.filter(
    (file) => file !== SELF_REFERENCE && !PT_SWEEP_EXCLUDED.includes(file)
  )
}

test("AC-06: no shipped harness text file reads as pt-BR prose", () => {
  const files = shippedHarnessTextFiles()
  assert.ok(
    files.length >= 100,
    `only ${files.length} candidate files found — the sweep's roots likely stopped resolving`
  )
  for (const file of files) {
    const content = readFileSync(file, "utf8")
    const probe = path.join(REPO_ROOT, ".ca-plans", "sweep-probe.md")
    const result = runHook(write(probe, content))
    assert.equal(
      result.status,
      0,
      `${path.relative(REPO_ROOT, file)} reads as pt-BR prose: ${result.stderr}`
    )
  }
})
