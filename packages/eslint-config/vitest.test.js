import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { Linter } from "eslint"

import { vitestConfig, vitestNodeConfig } from "./vitest.js"

const linter = new Linter()

function messagesFor(config, filename, code) {
  return linter.verify(code, config, filename)
}

function hasError(messages, ruleId) {
  return messages.some((message) => message.ruleId === ruleId && message.severity === 2)
}

const focusedTest = `describe("d", () => {
  it.only("t", () => {
    expect(1).toBe(1)
  })
})`

const disabledTest = `describe("d", () => {
  it.skip("t", () => {
    expect(1).toBe(1)
  })
})`

const standaloneExpect = `describe("d", () => {
  expect(1).toBe(1)
})`

const missingExpect = `describe("d", () => {
  it("t", () => {
    doSomething()
  })
})`

const conditionalExpect = `describe("d", () => {
  it("t", () => {
    if (condition) {
      expect(1).toBe(1)
    }
  })
})`

const conditionalInTest = `describe("d", () => {
  it("t", () => {
    if (condition) {
      doSomething()
    }
  })
})`

const identicalTitle = `describe("d", () => {
  it("t", () => {
    expect(1).toBe(1)
  })
  it("t", () => {
    expect(2).toBe(2)
  })
})`

const preferToBe = `describe("d", () => {
  it("t", () => {
    expect(1).toEqual(1)
  })
})`

const preferToHaveLength = `describe("d", () => {
  it("t", () => {
    expect(list.length).toBe(3)
  })
})`

const invalidExpect = `describe("d", () => {
  it("t", () => {
    expect(1)
  })
})`

const testInsteadOfIt = `describe("d", () => {
  test("t", () => {
    expect(1).toBe(1)
  })
})`

const missingTopLevelDescribe = `it("t", () => {
  expect(1).toBe(1)
})`

const tooManyNestedCallbacks = `describe("d", () => {
  it("t", () => {
    setTimeout(() => {
      setTimeout(() => {
        setTimeout(() => {
          expect(1).toBe(1)
        })
      })
    })
  })
})`

const cleanTest = `describe("d", () => {
  it("t", () => {
    expect(1).toBe(1)
  })
})`

const fireEventClick = `describe("d", () => {
  it("t", () => {
    fireEvent.click(button)
  })
})`

// LNT-01: cada regra do Done-when do T6 reporta error nas duas variantes —
// api (vitestNodeConfig em x.spec.ts) e web (vitestConfig em x.test.tsx).
const RULE_FIXTURES = [
  { ruleId: "vitest/no-focused-tests", code: focusedTest },
  { ruleId: "vitest/no-disabled-tests", code: disabledTest },
  { ruleId: "vitest/no-standalone-expect", code: standaloneExpect },
  { ruleId: "vitest/expect-expect", code: missingExpect },
  { ruleId: "vitest/no-conditional-expect", code: conditionalExpect },
  { ruleId: "vitest/no-conditional-in-test", code: conditionalInTest },
  { ruleId: "vitest/no-identical-title", code: identicalTitle },
  { ruleId: "vitest/prefer-to-be", code: preferToBe },
  { ruleId: "vitest/prefer-to-have-length", code: preferToHaveLength },
  { ruleId: "vitest/valid-expect", code: invalidExpect },
  { ruleId: "vitest/consistent-test-it", code: testInsteadOfIt },
  { ruleId: "vitest/require-top-level-describe", code: missingTopLevelDescribe },
  { ruleId: "max-nested-callbacks", code: tooManyNestedCallbacks },
]

describe("vitestNodeConfig / vitestConfig — LNT-01 (regras de erro)", () => {
  for (const { ruleId, code } of RULE_FIXTURES) {
    it(`${ruleId} reporta error em x.spec.ts (vitestNodeConfig)`, () => {
      const messages = messagesFor(vitestNodeConfig, "x.spec.ts", code)
      assert.ok(hasError(messages, ruleId), `esperava ${ruleId} em ${JSON.stringify(messages)}`)
    })

    it(`${ruleId} reporta error em x.test.tsx (vitestConfig)`, () => {
      const messages = messagesFor(vitestConfig, "x.test.tsx", code)
      assert.ok(hasError(messages, ruleId), `esperava ${ruleId} em ${JSON.stringify(messages)}`)
    })
  }
})

describe("vitestConfig — Testing Library", () => {
  it("testing-library/prefer-user-event reporta error em fireEvent.click", () => {
    const messages = messagesFor(vitestConfig, "x.test.tsx", fireEventClick)
    assert.ok(hasError(messages, "testing-library/prefer-user-event"))
  })

  it("no-manual-cleanup, prefer-explicit-assert e prefer-presence-queries valem error", () => {
    const testingLibraryBlock = vitestConfig.find((block) =>
      Object.keys(block.rules ?? {}).includes("testing-library/no-manual-cleanup"),
    )
    assert.equal(testingLibraryBlock?.rules["testing-library/no-manual-cleanup"], "error")
    assert.equal(testingLibraryBlock?.rules["testing-library/prefer-explicit-assert"], "error")
    assert.equal(testingLibraryBlock?.rules["testing-library/prefer-presence-queries"], "error")
  })
})

describe("LNT-02 — it.only, it sem expect, it com expect", () => {
  it("it.only(…) reporta error", () => {
    const messages = messagesFor(vitestNodeConfig, "x.spec.ts", focusedTest)
    assert.ok(hasError(messages, "vitest/no-focused-tests"))
  })

  it("it sem expect reporta error", () => {
    const messages = messagesFor(vitestNodeConfig, "x.spec.ts", missingExpect)
    assert.ok(hasError(messages, "vitest/expect-expect"))
  })

  it("it com expect passa limpo em ambas as configs", () => {
    assert.deepEqual(messagesFor(vitestNodeConfig, "x.spec.ts", cleanTest), [])
    assert.deepEqual(messagesFor(vitestConfig, "x.test.tsx", cleanTest), [])
  })
})
