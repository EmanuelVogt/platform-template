import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

function extractEnvExamplePassword() {
  const match = read("apps/api/.env.example").match(
    /^REDIS_URL=redis:\/\/:([^@]+)@/m
  )
  assert.ok(match, "apps/api/.env.example: REDIS_URL not found")
  return match[1]
}

function extractComposeRequirepass() {
  const match = read("docker-compose.yml").match(
    /"redis-server",\s*"--requirepass",\s*"([^"]+)"/
  )
  assert.ok(match, "docker-compose.yml: redis --requirepass not found")
  return match[1]
}

test("apps/api/.env.example REDIS_URL authenticates against the shipped compose Redis", () => {
  assert.equal(
    extractEnvExamplePassword(),
    extractComposeRequirepass(),
    "the password in apps/api/.env.example's REDIS_URL no longer matches docker-compose.yml's --requirepass"
  )
})
