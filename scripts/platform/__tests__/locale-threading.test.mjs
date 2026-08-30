import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"

// LOC-01 — "WHEN copier copy runs THEN it SHALL ask product_locale (default
// pt-BR) and thread it through the language rules in AGENTS.md.jinja,
// code-quality.md, communication.md and issue-tracker.md.jinja." Two of the
// four are `.jinja` and interpolate the value directly; the other two are
// static and instead point at the interpolated source — that shape is
// already established (.agents/skills/code-quality/SKILL.md:17,52,
// .agents/skills/communication/SKILL.md:14) and
// .agents/skills/issue-tracker/SKILL.md.jinja follows it too. AGENTS.md.jinja
// (post router-compression, plan-02 T5) carries a single canonical
// interpolation site — the Two standing rules line — instead of a
// duplicated Tripwires-section copy.

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const BASE_ANSWERS = {
  project_name: "Demo",
  github_org: "acme",
  root_domain: "demo.test",
  web_stack: "vite",
}

// `--skip-tasks` keeps this to plain jinja rendering — no `pnpm install`,
// `git init` or `skills:sync` — since only the rendered text matters here.
function renderChild(dir, extraAnswers = {}) {
  const dataArgs = Object.entries({
    ...BASE_ANSWERS,
    ...extraAnswers,
  }).flatMap(([key, value]) => ["--data", `${key}=${value}`])
  const result = spawnSync(
    "copier",
    [
      "copy",
      "--trust",
      "--defaults",
      "--skip-tasks",
      "--vcs-ref",
      "HEAD",
      ...dataArgs,
      REPO_ROOT,
      dir,
    ],
    { encoding: "utf8" }
  )
  assert.equal(
    result.status,
    0,
    `copier copy failed (${dir}): ${result.stderr}`
  )
}

let defaultDir
let enDir

before(() => {
  defaultDir = mkdtempSync(path.join(tmpdir(), "locale-default-"))
  enDir = mkdtempSync(path.join(tmpdir(), "locale-en-"))
  renderChild(defaultDir) // product_locale unset -> copier.yml default, pt-BR
  renderChild(enDir, { product_locale: "en" })
})

after(() => {
  rmSync(defaultDir, { recursive: true, force: true })
  rmSync(enDir, { recursive: true, force: true })
})

test("AGENTS.md.jinja interpolates product_locale, not a hardcoded literal", () => {
  const source = readFileSync(path.join(REPO_ROOT, "AGENTS.md.jinja"), "utf8")
  assert.match(
    source,
    /answer the user in \{\{ product_locale \}\}/,
    "the Two standing rules line must interpolate product_locale"
  )
})

test("code-quality's and communication's language rules point at AGENTS.md instead of hardcoding a locale", () => {
  const codeQuality = readFileSync(
    path.join(REPO_ROOT, ".agents", "skills", "code-quality", "SKILL.md"),
    "utf8"
  )
  assert.match(
    codeQuality,
    /\*\*Fixed language\*\* — see \[`AGENTS\.md`\]\([^)]*AGENTS\.md\) \(Two standing rules\)/,
    "code-quality/SKILL.md:17's Fixed language bullet must point at AGENTS.md's Two standing rules section, not just the file"
  )
  const communication = readFileSync(
    path.join(REPO_ROOT, ".agents", "skills", "communication", "SKILL.md"),
    "utf8"
  )
  assert.match(
    communication,
    /see `AGENTS\.md` \(Two standing rules\)/,
    "communication/SKILL.md:14's reply-language rule must point at AGENTS.md, not restate the locale"
  )
})

test("issue-tracker/SKILL.md.jinja stops hardcoding pt-BR (LOC-01)", () => {
  const source = readFileSync(
    path.join(
      REPO_ROOT,
      ".agents",
      "skills",
      "issue-tracker",
      "SKILL.md.jinja"
    ),
    "utf8"
  )
  assert.doesNotMatch(source, /pt-BR/, "the literal locale must be gone")
  assert.match(
    source,
    /AGENTS\.md/,
    "it must point at the canonical statement instead"
  )
})

test("a child rendered at product_locale=en reads en at the AGENTS.md canonical site", () => {
  const content = readFileSync(path.join(enDir, "AGENTS.md"), "utf8")
  assert.match(content, /answer the user in en,/)
})

test("a child rendered at the copier default (key unset) still reads pt-BR — no shipped string moves", () => {
  const content = readFileSync(path.join(defaultDir, "AGENTS.md"), "utf8")
  assert.match(content, /answer the user in pt-BR,/)
})

test("a rendered issue-tracker/SKILL.md ships identically regardless of locale and never hardcodes pt-BR again", () => {
  const rel = path.join(".agents", "skills", "issue-tracker", "SKILL.md")
  const atDefault = readFileSync(path.join(defaultDir, rel), "utf8")
  const atEn = readFileSync(path.join(enDir, rel), "utf8")
  assert.equal(atDefault, atEn)
  assert.doesNotMatch(atDefault, /pt-BR/)
  assert.match(atDefault, /AGENTS\.md/)
})
