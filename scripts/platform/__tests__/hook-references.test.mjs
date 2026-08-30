import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { shippedDocs, shippedSet } from "./lib/audience-contract.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const HOOKS_DIR = path.join(REPO_ROOT, ".claude", "hooks")
const DOCS_DIR = path.join(REPO_ROOT, "docs")
const SETTINGS_FILE = path.join(REPO_ROOT, ".claude", "settings.json")

// TOOL-07 (spec.md AC7) says "hook or handbook"; `docs/advisories/ADV-*.md`
// and `template-changelog.md` are historical ledgers (immutable once
// written, per their own preambles), not current-state manuals, so a path
// they name may have moved since — same reason ADRs are excluded.
const HANDBOOK_EXCLUDED = [
  /^docs\/advisories\/ADV-.*\.md$/,
  /^docs\/dev\/template-changelog\.md$/,
  /^docs\/adr\//,
]

// A handful of known, pre-existing gaps this cluster does not own the fix
// for (out of `docs/agents/**`) or that are schema placeholders, not real
// paths. Named, not silently swallowed — `scripts/lessons.py` should read
// `.agents/skills/tlc-spec-driven/scripts/lessons.py`.
const KNOWN_HANDBOOK_EXCEPTIONS = [
  {
    file: "docs/advisories/README.md",
    reference: "path/to/the.parity.spec.ts",
  },
]

// Matches a repo-relative-looking reference such as `docs/arch/front.md` or
// `./lib/dev-servers.mjs`; excludes matches that continue a JS regex literal
// (`/i.test(...)`) by requiring the first path segment to be at least 2 chars
// and by refusing a match that starts right after another `/`.
const PATH_RE =
  /(?<![/~])(?:\.{1,2}\/)*[A-Za-z0-9_-]{2,}(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+\b/g

function listHookFiles() {
  const files = []
  for (const entry of readdirSync(HOOKS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".mjs")) {
      files.push(path.join(HOOKS_DIR, entry.name))
    } else if (entry.isDirectory()) {
      const subDir = path.join(HOOKS_DIR, entry.name)
      for (const sub of readdirSync(subDir, { withFileTypes: true })) {
        if (sub.isFile() && sub.name.endsWith(".mjs")) {
          files.push(path.join(subDir, sub.name))
        }
      }
    }
  }
  return files
}

// A bare reference in these hooks resolves from the repo root, from a
// `.`-prefixed repo root directory (`.claude`, `.specs`), relative to the
// hook file's own directory (`./lib/...`), or relative to `.claude/hooks/`
// (a prose mention such as "lib/dev-servers.mjs"). It exists if any resolves.
function resolves(reference, hookFile) {
  const bases = [path.join(REPO_ROOT, reference)]
  if (!reference.startsWith("."))
    bases.push(path.join(REPO_ROOT, `.${reference}`))
  if (reference.startsWith("./") || reference.startsWith("../"))
    bases.push(path.resolve(path.dirname(hookFile), reference))
  else bases.push(path.join(HOOKS_DIR, reference))
  return bases.some((candidate) => existsSync(candidate))
}

function referencedPaths(content) {
  const found = []
  for (const match of content.matchAll(PATH_RE)) {
    const before = content.slice(Math.max(0, match.index - 3), match.index)
    if (before.includes("~")) continue // e.g. `~/.claude/platform-dispatch-log.jsonl`: a runtime path, not a repo one
    found.push(match[0])
  }
  return found
}

function listHandbookFiles() {
  const files = []
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".md") || entry.name.endsWith(".md.jinja"))
        files.push(full)
    }
  }
  walk(DOCS_DIR)
  for (const rel of ["CLAUDE.md", "AGENTS.md.jinja", "TEMPLATE.md"])
    files.push(path.join(REPO_ROOT, rel))
  return files.filter(
    (file) =>
      !HANDBOOK_EXCLUDED.some((re) => re.test(path.relative(REPO_ROOT, file)))
  )
}

// Narrower than `resolves()`: a handbook names a conformance spec or a
// helper (TOOL-07's own wording), never a bare mention relative to
// `.claude/hooks/`. It does gain the `.jinja` candidate — the template repo
// ships `docs/dev/deploy.md.jinja`, but a handbook describing what a
// *rendered child* will contain correctly writes `docs/dev/deploy.md`.
function resolvesForHandbook(reference, handbookFile) {
  const bases = [
    path.join(REPO_ROOT, reference),
    path.join(REPO_ROOT, `${reference}.jinja`),
  ]
  if (!reference.startsWith("."))
    bases.push(path.join(REPO_ROOT, `.${reference}`))
  if (reference.startsWith("./") || reference.startsWith("../"))
    bases.push(path.resolve(path.dirname(handbookFile), reference))
  else bases.push(path.join(DOCS_DIR, reference))
  return bases.some((candidate) => existsSync(candidate))
}

// TOOL-07 names "a file, helper or conformance spec" — restricting to test
// files and script/hook helpers keeps this to that class, instead of every
// illustrative FSD-layer path architecture docs use to show a pattern.
function isSpecOrHelperReference(reference) {
  return (
    /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(reference) ||
    /\.(e2e-spec|int-spec)\.ts$/.test(reference) ||
    reference.startsWith("scripts/") ||
    reference.startsWith(".claude/hooks/")
  )
}

function isKnownHandbookException(relFile, reference) {
  return KNOWN_HANDBOOK_EXCEPTIONS.some(
    (entry) => entry.file === relFile && entry.reference === reference
  )
}

test("the harness ships exactly 20 hook files under .claude/hooks", () => {
  assert.equal(listHookFiles().length, 20)
})

test("ca-full-cycle ships in the skill set and .claude/skills/ca-full-cycle resolves to it (AC-04)", () => {
  assert.ok(shippedSet().has(".agents/skills/ca-full-cycle/SKILL.md"))
  const mirror = path.join(REPO_ROOT, ".claude", "skills", "ca-full-cycle")
  const vendored = path.join(REPO_ROOT, ".agents", "skills", "ca-full-cycle")
  assert.ok(existsSync(mirror))
  assert.equal(realpathSync(mirror), realpathSync(vendored))
})

test("agent-harness skill names ca-full-cycle as the delegation framework (AC-04)", () => {
  const content = readFileSync(
    path.join(REPO_ROOT, ".agents", "skills", "agent-harness", "SKILL.md"),
    "utf8"
  )
  assert.match(content, /`ca-full-cycle`/)
})

test("AGENTS.md.jinja (the router) names ca-full-cycle as the dev framework (AC-04)", () => {
  const content = readFileSync(path.join(REPO_ROOT, "AGENTS.md.jinja"), "utf8")
  assert.match(content, /\.agents\/skills\/ca-full-cycle\/SKILL\.md/)
})

// Historical ledgers are excluded: `template-changelog.md` records what past
// versions shipped and is not current-state guidance (same reason
// `HANDBOOK_EXCLUDED` above treats it as immutable).
const TLC_SWEEP_EXCLUDED = [path.join(DOCS_DIR, "dev", "template-changelog.md")]
const TLC_SWEEP_EXTENSIONS = [".md", ".jinja", ".mjs", ".json", ".txt"]

function listTextFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listTextFiles(full))
    else if (TLC_SWEEP_EXTENSIONS.includes(path.extname(entry.name)))
      files.push(full)
  }
  return files
}

// docs/agents/** and docs/test/** no longer exist (plan-02 T1/T3: converted into
// .agents/skills/**); .claude/agents/** joins the roots per plan-01 QA carry-over
// (review.md item 9) — the surviving repo-scout/shell-runner cards get the same sweep.
test("no shipped doc or skill under .agents/skills/**, .claude/agents/** names tlc-spec-driven (AC-04)", () => {
  const roots = [
    path.join(REPO_ROOT, ".agents", "skills"),
    path.join(REPO_ROOT, ".claude", "agents"),
  ]
  for (const root of roots) {
    for (const file of listTextFiles(root)) {
      if (TLC_SWEEP_EXCLUDED.includes(file)) continue
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /tlc-spec-driven/,
        `${path.relative(REPO_ROOT, file)} still references tlc-spec-driven`
      )
    }
  }
})

test("plans-in-english.mjs is registered; specs-in-english.mjs and wave-plan-check.mjs are gone", () => {
  const settings = readFileSync(SETTINGS_FILE, "utf8")
  assert.match(settings, /plans-in-english\.mjs/)
  assert.doesNotMatch(settings, /specs-in-english\.mjs/)
  assert.doesNotMatch(settings, /wave-plan-check\.mjs/)
  assert.equal(existsSync(path.join(HOOKS_DIR, "plans-in-english.mjs")), true)
  assert.equal(existsSync(path.join(HOOKS_DIR, "specs-in-english.mjs")), false)
  assert.equal(existsSync(path.join(HOOKS_DIR, "wave-plan-check.mjs")), false)
})

test("no hook references a live `.specs` path, slash or bare (AC-09)", () => {
  for (const file of listHookFiles()) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /\.specs\b/,
      `${path.relative(REPO_ROOT, file)} still references .specs`
    )
  }
})

// .claude/agents/** joins the sweep per plan-01 QA carry-over (review.md item 9), same
// reasoning as the tlc-spec-driven sweep above.
test("no hook, top-level script or agent card references the removed spec-worker/spec-verifier cards (AC-09)", () => {
  const scriptsDir = path.join(REPO_ROOT, "scripts")
  const topLevelScripts = readdirSync(scriptsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
    .map((entry) => path.join(scriptsDir, entry.name))
  const agentsDir = path.join(REPO_ROOT, ".claude", "agents")
  const agentCards = readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(agentsDir, entry.name))
  for (const file of [...listHookFiles(), ...topLevelScripts, ...agentCards]) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /spec-(worker|verifier)\.md/,
      `${path.relative(REPO_ROOT, file)} still references a removed spec-worker/spec-verifier card`
    )
  }
})

test("no hook references a file, helper or spec that does not exist", () => {
  for (const file of listHookFiles()) {
    const content = readFileSync(file, "utf8")
    for (const reference of referencedPaths(content)) {
      assert.ok(
        resolves(reference, file),
        `${path.relative(REPO_ROOT, file)} references \`${reference}\`, which does not exist in the repo`
      )
    }
  }
})

test("no handbook names a conformance spec or helper that does not exist (TOOL-07)", () => {
  for (const file of listHandbookFiles()) {
    const relFile = path.relative(REPO_ROOT, file)
    const content = readFileSync(file, "utf8")
    for (const reference of referencedPaths(content)) {
      if (!isSpecOrHelperReference(reference)) continue
      if (isKnownHandbookException(relFile, reference)) continue
      assert.ok(
        resolvesForHandbook(reference, file),
        `${relFile} references \`${reference}\`, which does not exist in the repo`
      )
    }
  }
})

test("contract-enum.mjs no longer points at the absent select-options helper or contract-enums spec", () => {
  const content = readFileSync(
    path.join(HOOKS_DIR, "contract-enum.mjs"),
    "utf8"
  )
  assert.doesNotMatch(content, /select-options\.ts/)
  assert.doesNotMatch(content, /enumOptions/)
  assert.doesNotMatch(content, /contract-enums\.test\.ts/)
})

test("frontend-architecture skill no longer claims a contract-enums spec gates pre-push and CI", () => {
  const content = readFileSync(
    path.join(
      REPO_ROOT,
      ".agents",
      "skills",
      "frontend-architecture",
      "SKILL.md"
    ),
    "utf8"
  )
  assert.doesNotMatch(content, /contract-enums.*(pre-push|CI)/s)
  assert.doesNotMatch(content, /`contract-enums`\s*(conformance\s*)?spec/)
})

test("edit-reminders.mjs no longer mandates @workspace/ui, design tokens or Lucide", () => {
  const content = readFileSync(
    path.join(HOOKS_DIR, "edit-reminders.mjs"),
    "utf8"
  )
  assert.doesNotMatch(content, /@workspace\/ui/)
  assert.doesNotMatch(content, /design tokens/)
  assert.doesNotMatch(content, /Lucide/)
})

// plan-02's skill name map — the 9 guidance docs that became skills (D-04), and the
// pre-migration paths they replace.
const MAPPED_SKILLS = [
  ["backend-architecture", "SKILL.md"],
  ["frontend-architecture", "SKILL.md"],
  ["code-quality", "SKILL.md"],
  ["testing", "SKILL.md"],
  ["dev-workflow", "SKILL.md"],
  ["communication", "SKILL.md"],
  ["agent-harness", "SKILL.md"],
  ["infra", "SKILL.md.jinja"],
  ["issue-tracker", "SKILL.md.jinja"],
]
const OLD_DOC_PATHS = [
  "docs/arch/back.md",
  "docs/arch/front.md",
  "docs/code-quality.md",
  "docs/test/testing.md",
  "docs/agents/workflow.md",
  "docs/agents/communication.md",
  "docs/agents/harness.md",
  "docs/agents/infra.md.jinja",
  "docs/agents/issue-tracker.md.jinja",
]

test("AC-01: AGENTS.md.jinja is a <=60-line router whose table resolves to real skills, naming no old doc path", () => {
  const content = readFileSync(path.join(REPO_ROOT, "AGENTS.md.jinja"), "utf8")
  const lines = content.split("\n")
  assert.ok(
    lines.length <= 60,
    `AGENTS.md.jinja has ${lines.length} lines (cap 60)`
  )

  for (const oldPath of OLD_DOC_PATHS) {
    assert.ok(
      !content.includes(oldPath),
      `AGENTS.md.jinja still names the old doc path ${oldPath}`
    )
  }

  const headingIndex = lines.indexOf("## Read before you touch")
  assert.ok(headingIndex >= 0, "AGENTS.md.jinja must carry the situation table")
  const tableLines = []
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.startsWith("|")) {
      if (tableLines.length > 0) break
      continue
    }
    tableLines.push(line)
  }
  const rows = tableLines
    .filter((line) => line.includes("]("))
    .map((line) => /\[[^\]]*\]\(([^)\s]+)\)/.exec(line)?.[1])
  assert.ok(
    rows.length >= 5,
    `the situation table has to have rows to check — ${rows.length} found`
  )
  for (const target of rows) {
    assert.ok(target, "every table row must carry a link to the file")
    assert.match(
      target,
      /\/SKILL\.md(\.jinja)?$/,
      `${target} is not a SKILL.md(.jinja) path`
    )
    // The router names the rendered (post-copier) path even for a `.jinja`-sourced skill
    // (same convention the pre-existing docs/agents/infra.md row already used) — resolve
    // either the literal name or its `.jinja` source, same as resolvesForHandbook() above.
    const full = path.join(REPO_ROOT, target)
    assert.ok(
      existsSync(full) || existsSync(`${full}.jinja`),
      `AGENTS.md.jinja points at ${target}, which does not exist`
    )
  }
})

test("AC-02: each of the 9 mapped skills exists with a frontmatter description", () => {
  for (const [name, file] of MAPPED_SKILLS) {
    const full = path.join(REPO_ROOT, ".agents", "skills", name, file)
    assert.ok(existsSync(full), `.agents/skills/${name}/${file} is missing`)
    const content = readFileSync(full, "utf8")
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)
    assert.ok(
      frontmatter,
      `.agents/skills/${name}/${file} has no frontmatter block`
    )
    assert.match(
      frontmatter[1],
      /^description:\s*\S/m,
      `.agents/skills/${name}/${file}'s frontmatter has no description`
    )
  }
})

// Sweep hardening: the content check TOOL-07's tests run for hooks/handbooks extended to
// every shipped doc — template-changelog.md is the one exemption (an immutable ledger,
// same reason HANDBOOK_EXCLUDED above treats it that way).
test("AC-02: no shipped doc names an old pre-migration doc path (template-changelog.md excluded)", () => {
  for (const doc of shippedDocs()) {
    if (doc.destination === "docs/dev/template-changelog.md") continue
    const content = readFileSync(path.join(REPO_ROOT, doc.source), "utf8")
    for (const oldPath of OLD_DOC_PATHS) {
      assert.ok(
        !content.includes(oldPath),
        `${doc.destination} still names the old doc path ${oldPath}`
      )
    }
  }
})
