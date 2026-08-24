import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fsdNextConfig } from "./fsd-next.js"

const [boundariesConfig] = fsdNextConfig
const elements = boundariesConfig.settings["boundaries/elements"]
const policies = boundariesConfig.rules["boundaries/dependencies"][1].policies

function elementPattern(type) {
  return elements.find((element) => element.type === type)?.pattern
}

function allowedTypesFrom(type) {
  const policy = policies.find((entry) => entry.from.element.type === type)
  return policy.allow
    .filter((entry) => entry.to.element)
    .map((entry) => entry.to.element.type)
    .sort()
}

describe("fsd-next element patterns", () => {
  it("roots `app` at the Next App Router directory", () => {
    assert.equal(elementPattern("app"), "app")
  })

  it("defines _app and _pages under src/", () => {
    assert.equal(elementPattern("_app"), "src/_app")
    assert.equal(elementPattern("_pages"), "src/_pages/*")
  })

  it("keeps widgets/features/entities/shared patterns from fsd.js", () => {
    assert.equal(elementPattern("widgets"), "src/widgets/*")
    assert.equal(elementPattern("features"), "src/features/*")
    assert.equal(elementPattern("entities"), "src/entities/*")
    assert.equal(elementPattern("shared"), "src/shared")
  })
})

describe("fsd-next boundaries policy", () => {
  it("app may import only _app and _pages", () => {
    assert.deepEqual(allowedTypesFrom("app"), ["_app", "_pages"])
  })

  it("_app may import _pages, widgets, features, entities, shared", () => {
    assert.deepEqual(allowedTypesFrom("_app"), [
      "_pages",
      "entities",
      "features",
      "shared",
      "widgets",
    ])
  })

  it("_pages may import widgets, features, entities, shared but not _app", () => {
    const allowed = allowedTypesFrom("_pages")
    assert.deepEqual(allowed, ["entities", "features", "shared", "widgets"])
    assert.ok(!allowed.includes("_app"))
  })

  it("defaults to disallow so unlisted crossings are blocked", () => {
    assert.equal(
      boundariesConfig.rules["boundaries/dependencies"][1].default,
      "disallow"
    )
  })
})

describe("fsd-next files scope", () => {
  it("applies to both app/ and src/ TypeScript files", () => {
    assert.deepEqual(boundariesConfig.files, [
      "app/**/*.{ts,tsx}",
      "src/**/*.{ts,tsx}",
    ])
  })
})
