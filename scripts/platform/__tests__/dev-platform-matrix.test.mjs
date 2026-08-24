import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

// TOOL-10 — "WHEN a reader looks for supported dev platforms THEN
// README.md.jinja, docs/dev/local-environment.md, TEMPLATE.md and
// _message_after_copy SHALL state macOS / Linux / WSL2 and that native
// Windows is not supported."

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

const MATRIX = /macOS, Linux, WSL2 on Windows\. Native Windows is not supported/

test("README.md.jinja, docs/dev/local-environment.md and TEMPLATE.md state the identical platform matrix, naming sync-agent-skills.mjs", () => {
  for (const rel of [
    "README.md.jinja",
    "docs/dev/local-environment.md",
    "TEMPLATE.md",
  ]) {
    const text = read(rel)
    assert.match(text, MATRIX, `${rel} must state the platform matrix`)
    assert.match(
      text,
      /scripts\/sync-agent-skills\.mjs/,
      `${rel} must name sync-agent-skills.mjs as the reason`
    )
  }
})

test("copier.yml's _message_after_copy states the same platform matrix at generation time", () => {
  const messageMatch = read("copier.yml").match(
    /_message_after_copy:\s*\|\n((?:[ \t]+\S.*\n|\n)*)/
  )
  assert.ok(messageMatch, "copier.yml must declare _message_after_copy")
  const messageBlock = messageMatch[1]
  assert.match(
    messageBlock,
    /macOS, Linux, WSL2/,
    "_message_after_copy must name macOS, Linux, WSL2"
  )
  assert.match(
    messageBlock,
    /Windows nativo não é suportado/,
    "_message_after_copy must state native Windows is unsupported"
  )
})
