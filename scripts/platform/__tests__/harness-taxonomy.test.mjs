import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

// The tlc-spec-driven skill is gone. `.agents/skills/ca-full-cycle/**` and
// `.agents/skills/ca-spec-driven/**` are vendored as-is (out of scope) and
// carry their own generic "availability/booking" P0-category example,
// unrelated to any pilot's domain — same exemption `audience-contract.mjs`
// gives the skills tree. The template-owned P0 sites are the agent-harness
// skill (docs/agents/harness.md's replacement, plan-02 T3), the P0 tier guide
// inside `subagent-model-required.mjs` and the spec-verifier card, both back
// in v4.1.0 with ca-spec-driven.
const TAXONOMY_FILES = [
  ".agents/skills/agent-harness/SKILL.md",
  ".claude/hooks/subagent-model-required.mjs",
  ".claude/agents/spec-verifier.md",
]

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

test("tlc-spec-driven no longer ships; the spec-worker/spec-verifier cards ship as ca-spec-driven's", () => {
  assert.equal(
    existsSync(path.join(REPO_ROOT, ".agents/skills/tlc-spec-driven")),
    false
  )
  for (const rel of [
    ".claude/agents/spec-worker.md",
    ".claude/agents/spec-verifier.md",
  ]) {
    assert.match(read(rel), /ca-spec-driven/, rel)
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
