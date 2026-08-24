import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

// LOC-02 — "WHEN a reader looks for the language convention THEN it SHALL be
// stated in exactly one place and referenced from the others." AGENTS.md is
// that one place (LOC-01, locale-threading.test.mjs); code-quality.md and
// communication.md already point at it there too. This file closes the rest
// of T38's Touches — the plain `.md` docs that used to restate the rule
// instead of linking it.

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

test("docs/test/testing.md defers to the code-quality language convention instead of restating a locale", () => {
  assert.match(
    read("docs/test/testing.md"),
    /follows the code-quality language convention/,
    "testing.md must defer to code-quality.md instead of hard-coding a locale"
  )
})

test("docs/adr/README.md and docs/advisories/README.md point at AGENTS.md for the product's language instead of hard-coding a locale", () => {
  const linksToAgents =
    /in the product's language \(see \[`AGENTS\.md`\]\([^)]*AGENTS\.md\)/
  assert.match(
    read("docs/adr/README.md"),
    linksToAgents,
    "adr/README.md must defer to AGENTS.md instead of restating the locale"
  )
  assert.match(
    read("docs/advisories/README.md"),
    linksToAgents,
    "advisories/README.md must defer to AGENTS.md instead of restating the locale"
  )
})
