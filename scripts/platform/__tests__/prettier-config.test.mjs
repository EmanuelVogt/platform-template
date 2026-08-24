import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
)
const require = createRequire(path.join(ROOT, "package.json"))

function collectPathLikeStrings(value, acc = []) {
  if (typeof value === "string") {
    if (value.includes("/")) acc.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectPathLikeStrings(item, acc)
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectPathLikeStrings(item, acc)
  }
  return acc
}

test("every filesystem path named in .prettierrc exists", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(ROOT, ".prettierrc"), "utf8")
  )
  const pathLikeValues = collectPathLikeStrings(config)
  for (const value of pathLikeValues) {
    assert.ok(
      fs.existsSync(path.join(ROOT, value)),
      `.prettierrc names a path that does not exist: ${value}`
    )
  }
})

test("every .prettierrc plugin resolves from the root node_modules", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(ROOT, ".prettierrc"), "utf8")
  )
  const plugins = Array.isArray(config.plugins) ? config.plugins : []
  for (const plugin of plugins) {
    assert.doesNotThrow(
      () => require.resolve(plugin),
      `plugin not resolvable: ${plugin}`
    )
  }
})

function checkedExtensions(formatCheckScript) {
  const braceGroup = formatCheckScript.match(/\{([^{}]+)\}/)
  assert.ok(
    braceGroup,
    `format:check should name a brace-expanded extension set: ${formatCheckScript}`
  )
  return new Set(braceGroup[1].split(","))
}

test("package.json's format:check covers the spec-required extensions and excludes markdown", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
  )
  const extensions = checkedExtensions(pkg.scripts["format:check"])
  for (const ext of [
    "ts",
    "tsx",
    "mts",
    "mjs",
    "cjs",
    "js",
    "jsx",
    "json",
    "yml",
    "yaml",
    "css",
  ]) {
    assert.ok(extensions.has(ext), `format:check should cover .${ext}`)
  }
  assert.ok(!extensions.has("md"), "format:check should not cover .md")
})

test(".prettierignore lists the paths FMT-05 requires excluded", () => {
  const lines = fs
    .readFileSync(path.join(ROOT, ".prettierignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  for (const entry of [
    "*.jinja",
    "docs/platform_template/",
    "packages/api-client/generated/",
    "openapi.json",
    ".worktrees/",
    ".specs/",
    ".claude/settings.local.json",
  ]) {
    assert.ok(lines.includes(entry), `.prettierignore should list ${entry}`)
  }
})
