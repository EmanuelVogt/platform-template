import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

function extractPort(rel, pattern) {
  const match = read(rel).match(pattern)
  assert.ok(match, `${rel}: expected to match ${pattern}`)
  return match[1]
}

test("exactly one API port literal appears across every site a child reads", () => {
  const sites = [
    [
      "apps/api/src/shared/config/env.ts",
      /PORT: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.default\((\d+)\)/,
    ],
    ["apps/api/.env.example", /^PORT=(\d+)$/m],
    ["apps/web/.env.example", /VITE_API_URL=http:\/\/localhost:(\d+)/],
    ["apps/api/Dockerfile", /EXPOSE (\d+)/],
    ["apps/api/Dockerfile", /process\.env\.PORT\|\|(\d+)/],
    ["apps/api/Dockerfile.dev", /EXPOSE (\d+)/],
    ["README.md.jinja", /API at `http:\/\/localhost:(\d+)`/],
    [".github/README.md", /API at `http:\/\/localhost:(\d+)`/],
    ["docs/dev/local-environment.md", /api \((\d+)\)/],
  ]

  const ports = sites.map(([rel, pattern]) => [rel, extractPort(rel, pattern)])
  const canonical = ports[0][1]
  for (const [site, value] of ports) {
    assert.equal(
      value,
      canonical,
      `${site} carries port ${value}, expected ${canonical} — drifted from the other sites`
    )
  }
})

test("env.ts default, apps/api/.env.example and local-environment.md agree on 3000", () => {
  assert.equal(
    extractPort(
      "apps/api/src/shared/config/env.ts",
      /PORT: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.default\((\d+)\)/
    ),
    "3000"
  )
  assert.equal(extractPort("apps/api/.env.example", /^PORT=(\d+)$/m), "3000")
  assert.equal(
    extractPort("docs/dev/local-environment.md", /api \((\d+)\)/),
    "3000"
  )
})

test("docker-compose.yml api service: host mapping and container port agree", () => {
  const compose = read("docker-compose.yml")
  const apiBlock = compose.slice(compose.indexOf("\n  api:"))
  const match = apiBlock.match(/ports:\s*\n\s*- "(\d+):(\d+)"/)
  assert.ok(match, "docker-compose.yml: api service port mapping not found")
  const [, hostPort, containerPort] = match
  assert.equal(
    hostPort,
    containerPort,
    "host and container ports disagree in the api service mapping"
  )
  assert.equal(hostPort, "3000")
})
