import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

// The tlc-spec-driven skill, `.claude/agents/spec-verifier.md` and the P0 tier
// guide once inside `subagent-model-required.mjs` are gone; `.agents/skills/
// ca-full-cycle/**` is vendored as-is (out of scope) and carries its own
// generic "availability/booking" P0-category example, unrelated to any
// pilot's domain — same exemption `audience-contract.mjs` gives the skills
// tree. `docs/agents/harness.md` is the one surviving template-owned site.
const TAXONOMY_FILES = ["docs/agents/harness.md"]

test("no P0-taxonomy site names booking/availability domain rules", () => {
  for (const rel of TAXONOMY_FILES) {
    assert.doesNotMatch(
      read(rel),
      /availability\/booking|booking\/availability|booking rules/i,
      `${rel} still names the pilot's booking domain`
    )
  }
})

test("every P0-taxonomy site names generic categories and defers to the product's own domain doc", () => {
  for (const rel of TAXONOMY_FILES) {
    const text = read(rel)
    assert.match(text, /auth/i, `${rel} drops the "auth" category`)
    assert.match(text, /payment/i, `${rel} drops the "payment" category`)
    assert.match(
      text,
      /data integrity/i,
      `${rel} drops the "data integrity" category`
    )
    assert.match(
      text,
      /product'?s own domain doc/i,
      `${rel} does not defer to the product's own domain doc`
    )
  }
})

test("tlc-spec-driven and the spec-worker/spec-verifier agent cards no longer ship", () => {
  for (const rel of [
    ".agents/skills/tlc-spec-driven",
    ".claude/agents/spec-worker.md",
    ".claude/agents/spec-verifier.md",
  ]) {
    assert.equal(existsSync(path.join(REPO_ROOT, rel)), false, rel)
  }
})

test("the two illustrative examples this task neutralizes stay neutral", () => {
  assert.equal(
    existsSync(path.join(REPO_ROOT, ".agents/skills/tlc-spec-driven/SKILL.md")),
    false
  )
  assert.doesNotMatch(
    read(".agents/skills/repo-discovery/SKILL.md"),
    /motor de agenda/i
  )
})
