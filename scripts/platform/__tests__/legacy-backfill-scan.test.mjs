import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

// T10 removed the owner's legacy-MySQL backfill story from the shipped dev
// environment. docs-no-owner-infra.test.mjs already guards BRAND-06's docs
// half (docs/agents/** + deploy.md.jinja, via OWNER_INFRA_TERMS' MySQL
// entry); this file closes the other half the requirement names — compose
// and the dev entrypoint — neither of which is a doc that guard scans.
const BACKFILL_MARKERS = [
  /RUN_BACKFILL/,
  /SyncLegacyModule/,
  /db:backfill:legacy/,
  /\bMySQL\b/i,
]

function backfillHits(text) {
  const hits = []
  for (const marker of BACKFILL_MARKERS) {
    const match = text.match(marker)
    if (match) hits.push(match[0])
  }
  return hits
}

test("self-test: the guard is not vacuous — it flags the removed backfill markers", () => {
  assert.deepEqual(
    backfillHits(
      "RUN_BACKFILL=1 triggers SyncLegacyModule against db:backfill:legacy on the old MySQL box."
    ),
    ["RUN_BACKFILL", "SyncLegacyModule", "db:backfill:legacy", "MySQL"]
  )
})

test("docker-compose.yml carries no legacy-MySQL backfill wiring", () => {
  assert.deepEqual(backfillHits(read("docker-compose.yml")), [])
})

test("apps/api/docker-entrypoint.dev.sh no longer branches on RUN_BACKFILL or SyncLegacyModule", () => {
  assert.deepEqual(backfillHits(read("apps/api/docker-entrypoint.dev.sh")), [])
})
