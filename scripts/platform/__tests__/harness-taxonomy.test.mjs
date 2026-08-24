import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

const TAXONOMY_FILES = [
  ".agents/skills/tlc-spec-driven/SKILL.md",
  ".agents/skills/tlc-spec-driven/references/validate.md",
  ".agents/skills/tlc-spec-driven/references/sub-agents.md",
  ".agents/skills/tlc-spec-driven/references/cards/orchestrator.md",
  ".claude/agents/spec-verifier.md",
  ".claude/hooks/subagent-model-required.mjs",
  "docs/agents/harness.md",
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

test("the two illustrative examples this task neutralizes stay neutral", () => {
  assert.doesNotMatch(
    read(".agents/skills/tlc-spec-driven/SKILL.md"),
    /guest-agenda/i
  )
  assert.doesNotMatch(
    read(".agents/skills/repo-discovery/SKILL.md"),
    /motor de agenda/i
  )
})
