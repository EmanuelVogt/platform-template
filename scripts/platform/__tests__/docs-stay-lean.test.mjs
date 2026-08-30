import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const HOOK_PATH = path.join(REPO_ROOT, ".claude", "hooks", "docs-stay-lean.mjs")

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n")
const doc = (rel) => path.join(REPO_ROOT, rel)

function runHook(payload, env = {}) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, PLATFORM_DOCS_LEAN_OFF: "", ...env },
  })
  return { status: result.status, stderr: result.stderr }
}

const edit = (file_path, new_string, old_string = "a") => ({
  tool_name: "Edit",
  tool_input: { file_path, old_string, new_string },
})
const write = (file_path, content) => ({
  tool_name: "Write",
  tool_input: { file_path, content },
})
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } })

test("growth: an edit adding up to 30 lines passes, 31 is blocked", () => {
  assert.equal(
    runHook(edit(doc(".agents/skills/code-quality/SKILL.md"), lines(31)))
      .status,
    0
  )
  const blocked = runHook(
    edit(doc(".agents/skills/code-quality/SKILL.md"), lines(32))
  )
  assert.equal(blocked.status, 2)
  assert.match(blocked.stderr, /grows .* by 31 lines \(cap 30\)/)
})

test("growth: MultiEdit sums the net growth of every edit", () => {
  const result = runHook({
    tool_name: "MultiEdit",
    tool_input: {
      file_path: doc(".agents/skills/code-quality/SKILL.md"),
      edits: [
        { old_string: "a", new_string: lines(20) },
        { old_string: "b", new_string: lines(20) },
      ],
    },
  })
  assert.equal(result.status, 2)
})

test("growth: .md.jinja handbooks, .agents/skills/** and AGENTS.md.jinja count as handbooks", () => {
  assert.equal(
    runHook(edit(doc("docs/dev/deploy.md.jinja"), lines(40))).status,
    2
  )
  assert.equal(runHook(edit(doc("AGENTS.md.jinja"), lines(40))).status, 2)
  assert.equal(
    runHook(edit(doc(".agents/skills/infra/SKILL.md.jinja"), lines(40))).status,
    2
  )
})

test("new file: handbook cap is 80, uniformly (no ADR carve-out survives)", () => {
  assert.equal(
    runHook(write(doc("docs/dev/new-thing.md"), lines(80))).status,
    0
  )
  assert.equal(
    runHook(write(doc("docs/dev/new-thing.md"), lines(81))).status,
    2
  )
  // A path under the removed docs/adr/ gets no special cap anymore — it is
  // just another handbook, capped at 80 like any other.
  assert.equal(runHook(write(doc("docs/adr/9999-new.md"), lines(80))).status, 0)
  assert.equal(runHook(write(doc("docs/adr/9999-new.md"), lines(81))).status, 2)
})

test("rationale: heading or pt-BR phrase in a handbook is blocked; code spans are ignored", () => {
  const skill = doc(".agents/skills/dev-workflow/SKILL.md")
  assert.equal(runHook(edit(skill, "## Why this design\ntext")).status, 2)
  assert.equal(runHook(edit(skill, "## Alternatives\ntext")).status, 2)
  assert.equal(runHook(edit(skill, "Optamos por isso.")).status, 2)
  assert.equal(runHook(edit(skill, "run `porque --why`")).status, 0)
})

test("scope: a former ADR path blocks rationale like any handbook; advisories, .specs and source are not handbooks", () => {
  assert.equal(
    runHook(edit(doc("docs/adr/0001-x.md"), "## Why\nporque sim")).status,
    2
  )
  assert.equal(
    runHook(
      write(doc("docs/advisories/ADV-20260823-01.md"), `${lines(120)}\nporque`)
    ).status,
    0
  )
  assert.equal(
    runHook(write(doc(".specs/features/x/spec.md"), `${lines(200)}\nporque`))
      .status,
    0
  )
  assert.equal(runHook(edit(doc("apps/api/src/main.ts"), lines(90))).status, 0)
})

test("bash: shell writes into a handbook are blocked, reads and git mv pass", () => {
  assert.equal(runHook(bash("cat > docs/dev/x.md <<'EOF'\nhi\nEOF")).status, 2)
  assert.equal(
    runHook(bash('sed -i "" "s/a/b/" docs/dev/local-environment.md')).status,
    2
  )
  assert.equal(runHook(bash("echo x | tee docs/dev/deploy.md.jinja")).status, 2)
  assert.equal(runHook(bash("echo x >> AGENTS.md.jinja")).status, 2)
  assert.equal(
    runHook(bash("grep -n foo docs/dev/local-environment.md")).status,
    0
  )
  assert.equal(runHook(bash("git mv docs/a.md docs/b.md")).status, 0)
  assert.equal(runHook(bash("pnpm check")).status, 0)
})

test("escape hatches: PLATFORM_DOCS_LEAN_OFF=1 and unparsable stdin never block", () => {
  assert.equal(
    runHook(edit(doc("docs/code-quality.md"), lines(99)), {
      PLATFORM_DOCS_LEAN_OFF: "1",
    }).status,
    0
  )
  assert.equal(runHook("not json").status, 0)
})
