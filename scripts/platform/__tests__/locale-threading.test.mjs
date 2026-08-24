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
// already established (code-quality.md:12,47, communication.md:9) and
// issue-tracker.md.jinja now follows it too.

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
    /user-facing errors \{\{ product_locale \}\}/,
    "the Tripwires -> Language line must interpolate product_locale"
  )
  assert.match(
    source,
    /answer the user in \{\{ product_locale \}\}/,
    "the Two standing rules line must interpolate product_locale"
  )
})

test("code-quality.md's and communication.md's language rules point at AGENTS.md instead of hardcoding a locale", () => {
  const codeQuality = readFileSync(
    path.join(REPO_ROOT, "docs", "code-quality.md"),
    "utf8"
  )
  assert.match(
    codeQuality,
    /\*\*Fixed language\*\* — see \[`AGENTS\.md`\]\([^)]*AGENTS\.md\)/,
    "code-quality.md:12's Fixed language bullet must point at AGENTS.md, not restate the locale"
  )
  const communication = readFileSync(
    path.join(REPO_ROOT, "docs", "agents", "communication.md"),
    "utf8"
  )
  assert.match(
    communication,
    /see \[`AGENTS\.md`\]\([^)]*AGENTS\.md\) \(Two standing rules\)/,
    "communication.md:9's reply-language rule must point at AGENTS.md, not restate the locale"
  )
})

test("issue-tracker.md.jinja stops hardcoding pt-BR (LOC-01)", () => {
  const source = readFileSync(
    path.join(REPO_ROOT, "docs", "agents", "issue-tracker.md.jinja"),
    "utf8"
  )
  assert.doesNotMatch(source, /pt-BR/, "the literal locale must be gone")
  assert.match(
    source,
    /AGENTS\.md/,
    "it must point at the canonical statement instead"
  )
})

test("a child rendered at product_locale=en reads en at both AGENTS.md sites", () => {
  const content = readFileSync(path.join(enDir, "AGENTS.md"), "utf8")
  assert.match(content, /user-facing errors en\./)
  assert.match(content, /answer the user in en,/)
})

test("a child rendered at the copier default (key unset) still reads pt-BR — no shipped string moves", () => {
  const content = readFileSync(path.join(defaultDir, "AGENTS.md"), "utf8")
  assert.match(content, /user-facing errors pt-BR\./)
  assert.match(content, /answer the user in pt-BR,/)
})

test("a rendered issue-tracker.md ships identically regardless of locale and never hardcodes pt-BR again", () => {
  const rel = path.join("docs", "agents", "issue-tracker.md")
  const atDefault = readFileSync(path.join(defaultDir, rel), "utf8")
  const atEn = readFileSync(path.join(enDir, rel), "utf8")
  assert.equal(atDefault, atEn)
  assert.doesNotMatch(atDefault, /pt-BR/)
  assert.match(atDefault, /AGENTS\.md/)
})
