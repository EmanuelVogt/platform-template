import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")
const readJson = (rel) => JSON.parse(read(rel))

const DOCS = [
  "README.md.jinja",
  ".github/README.md",
  "docs/dev/local-environment.md",
]

function fencedBlocks(content) {
  const blocks = []
  const re = /```[^\n]*\n([\s\S]*?)```/g
  let match
  while ((match = re.exec(content))) blocks.push(match[1])
  return blocks
}

function pnpmCommands(content) {
  const commands = []
  for (const block of fencedBlocks(content)) {
    for (const line of block.split("\n")) {
      const stripped = line.split("#")[0].trim()
      const match = stripped.match(/^pnpm\s+(?:--filter\s+api\s+)?(\S+)/)
      if (!match) continue
      commands.push({
        scope: stripped.includes("--filter api") ? "api" : "root",
        token: match[1],
        raw: stripped,
      })
    }
  }
  return commands
}

test("every documented pnpm command resolves in a manifest", () => {
  const rootScripts = readJson("package.json").scripts
  const apiScripts = readJson("apps/api/package.json").scripts
  const pnpmBuiltins = new Set(["install"])

  for (const doc of DOCS) {
    for (const { scope, token, raw } of pnpmCommands(read(doc))) {
      const resolved =
        scope === "api"
          ? Object.hasOwn(apiScripts, token)
          : pnpmBuiltins.has(token) || Object.hasOwn(rootScripts, token)
      assert.ok(
        resolved,
        `${doc}: \`${raw}\` names \`${token}\`, which is not a pnpm builtin or a script in the matching manifest`
      )
    }
  }
})

test("db:bootstrap and db:seed:demo are named in no doc", () => {
  for (const doc of DOCS) {
    const content = read(doc)
    assert.doesNotMatch(
      content,
      /db:bootstrap/,
      `${doc} still names db:bootstrap`
    )
    assert.doesNotMatch(
      content,
      /db:seed:demo/,
      `${doc} still names db:seed:demo`
    )
  }
})

test("db:seed is named in no doc and is not an apps/api script", () => {
  for (const doc of DOCS) {
    assert.doesNotMatch(
      read(doc),
      /db:seed\b(?!:demo)/,
      `${doc} still names db:seed`
    )
  }
  assert.equal(
    Object.hasOwn(readJson("apps/api/package.json").scripts, "db:seed"),
    false
  )
})

test("no apps/api script targets the absent src/seeds directory", () => {
  const apiScripts = readJson("apps/api/package.json").scripts
  for (const [name, command] of Object.entries(apiScripts)) {
    assert.doesNotMatch(
      command,
      /src\/seeds/,
      `script "${name}" still targets the absent apps/api/src/seeds`
    )
  }
})
