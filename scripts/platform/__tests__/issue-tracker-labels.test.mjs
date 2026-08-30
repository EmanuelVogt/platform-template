import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

// BRAND-03 (spec.md AC4): "WHEN an agent in a child creates an issue THEN the
// area-label list SHALL come from a product-filled placeholder, with the
// closed-list rule intact and the worked examples domain-neutral." The shape
// itself was adjudicated as wave-1 deviation 1; these are the assertions
// validation.md's Fix 4 found missing.

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const ISSUE_TRACKER_PATH = path.join(
  REPO_ROOT,
  ".agents",
  "skills",
  "issue-tracker",
  "SKILL.md.jinja"
)

function content() {
  return readFileSync(ISSUE_TRACKER_PATH, "utf8")
}

test("BRAND-03 — the area-label placeholder is discovered with `gh label list`, not reused from this file", () => {
  assert.match(
    content(),
    /Confirm with\s+`gh label list` before creating an issue rather than reusing an example from this file/,
    "the discovery mechanism must send the agent to the real repo labels"
  )
})

test("BRAND-03 — the area-label rule stays a closed list, with an explicit no-fit escape hatch", () => {
  const text = content()
  assert.match(text, /Three axes, all closed lists/)
  assert.match(text, /\*\*Area\*\* \(one per issue, closed list\)/)
  assert.match(text, /None fits → issue with no area label/)
})

test("BRAND-03 — the worked label examples are domain-neutral, not the owner's pilot-domain vocabulary", () => {
  const match = content().match(
    /Illustrative shape only[\s\S]*?None fits → issue with no area label\./
  )
  assert.ok(match, "the illustrative examples sentence must exist")
  const illustrativeLine = match[0]
  assert.match(illustrativeLine, /`Billing`/)
  for (const domainTerm of [
    "Hóspedes",
    "Hospedes",
    "Reservas",
    "Quartos",
    "Hospedagem",
    "Check-in",
  ]) {
    assert.doesNotMatch(illustrativeLine, new RegExp(domainTerm, "i"))
  }
})
