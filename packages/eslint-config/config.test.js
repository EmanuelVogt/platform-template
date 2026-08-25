import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ESLint } from "eslint"

import { fsdConfig } from "./fsd.js"
import { nestConfig } from "./nest.js"
import { reactConfig } from "./react.js"
import { vitestConfig, vitestNodeConfig } from "./vitest.js"

// A composição é a mesma dos apps (`apps/api/eslint.config.mjs`,
// `apps/web-vite/eslint.config.js`): uma regra ligada em `vitest.js` mas
// desligada por um bloco posterior resolveria `off` sem ninguém perceber.
const API_CONFIG = [...nestConfig, ...vitestNodeConfig]
const WEB_CONFIG = [...reactConfig, ...fsdConfig, ...vitestConfig]

const API_TEST_FILE = "src/modules/example/example.spec.ts"
const WEB_TEST_FILE = "src/pages/example/example.test.tsx"

async function severities(overrideConfig, filePath) {
  const eslint = new ESLint({
    cwd: import.meta.dirname,
    overrideConfigFile: true,
    overrideConfig,
  })
  const config = await eslint.calculateConfigForFile(filePath)
  return config.rules ?? {}
}

function severityOf(rules, ruleId) {
  const entry = rules[ruleId]
  return Array.isArray(entry) ? entry[0] : entry
}

const VITEST_ERROR_RULES = [
  "vitest/no-focused-tests",
  "vitest/no-disabled-tests",
  "vitest/expect-expect",
  "vitest/no-conditional-expect",
]

const TESTING_LIBRARY_RULES = [
  "testing-library/no-node-access",
  "testing-library/prefer-screen-queries",
  "testing-library/no-wait-for-multiple-assertions",
]

const JEST_DOM_RULES = [
  "jest-dom/prefer-checked",
  "jest-dom/prefer-empty",
  "jest-dom/prefer-enabled-disabled",
  "jest-dom/prefer-focus",
  "jest-dom/prefer-in-document",
  "jest-dom/prefer-required",
  "jest-dom/prefer-to-have-attribute",
  "jest-dom/prefer-to-have-class",
  "jest-dom/prefer-to-have-style",
  "jest-dom/prefer-to-have-text-content",
  "jest-dom/prefer-to-have-value",
]

describe("LNT-01 — severidades resolvidas para um arquivo de teste da api", () => {
  for (const ruleId of VITEST_ERROR_RULES) {
    it(`${ruleId} resolve error em ${API_TEST_FILE}`, async () => {
      const rules = await severities(API_CONFIG, API_TEST_FILE)
      assert.equal(severityOf(rules, ruleId), 2)
    })
  }

  it("as regras de jest-dom não alcançam a api", async () => {
    const rules = await severities(API_CONFIG, API_TEST_FILE)
    for (const ruleId of JEST_DOM_RULES) {
      assert.equal(severityOf(rules, ruleId), undefined, ruleId)
    }
  })
})

describe("LNT-01 — severidades resolvidas para um arquivo de teste do web", () => {
  for (const ruleId of VITEST_ERROR_RULES) {
    it(`${ruleId} resolve error em ${WEB_TEST_FILE}`, async () => {
      const rules = await severities(WEB_CONFIG, WEB_TEST_FILE)
      assert.equal(severityOf(rules, ruleId), 2)
    })
  }

  it("as regras recomendadas de testing-library resolvem error", async () => {
    const rules = await severities(WEB_CONFIG, WEB_TEST_FILE)
    for (const ruleId of TESTING_LIBRARY_RULES) {
      assert.equal(severityOf(rules, ruleId), 2, ruleId)
    }
  })

  it("as regras recomendadas de jest-dom resolvem error", async () => {
    const rules = await severities(WEB_CONFIG, WEB_TEST_FILE)
    for (const ruleId of JEST_DOM_RULES) {
      assert.equal(severityOf(rules, ruleId), 2, ruleId)
    }
  })
})

describe("LNT-01 — o endurecimento não vaza para código de produção", () => {
  it("no-focused-tests não resolve em um arquivo que não é de teste", async () => {
    const rules = await severities(API_CONFIG, "src/modules/example/example.ts")
    assert.equal(severityOf(rules, "vitest/no-focused-tests"), undefined)
  })
})
