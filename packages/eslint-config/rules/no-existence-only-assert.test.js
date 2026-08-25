import { describe, it } from "node:test"

import { RuleTester } from "eslint"

import { noExistenceOnlyAssert } from "./no-existence-only-assert.js"

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
})

const existenceOnly = [{ messageId: "existenceOnly" }]

ruleTester.run("no-existence-only-assert", noExistenceOnlyAssert, {
  valid: [
    // Um valor concreto no corpo — a existência ali é só o guarda que a precede.
    `it("t", () => { expect(user).toBeDefined(); expect(user.email).toBe("a@b.c") })`,
    `it("t", () => { expect(rows.length).toBe(2) })`,
    `it("t", async () => { await expect(run()).resolves.toEqual({ id: 1 }) })`,
    `it("t", async () => { await expect(run()).rejects.toThrow(ConflictError) })`,
    `it("t", () => { expect(() => parse("x")).not.toThrow(SyntaxError) })`,
    // A declaração explícita é a saída documentada quando só há existência.
    `it("t", () => { expect.assertions(1); expect(result).toBeDefined() })`,
    // Sem asserção nenhuma: é vitest/expect-expect que fala, não esta regra.
    `it("t", () => { doSomething() })`,
    // describe não é corpo de teste.
    `describe("d", () => { expect(x).toBeDefined() })`,
    `it("t", () => { expect(status).not.toBe(401) })`,
  ],
  invalid: [
    {
      code: `it("t", () => { expect(result).toBeDefined() })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", () => { expect(result).toBeUndefined() })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", () => { expect(result).toBeTruthy() })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", () => { expect(result).toBeFalsy() })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", async () => { await expect(run()).resolves.toBeDefined() })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", async () => { await expect(run()).rejects.toBeDefined() })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", () => { expect(() => parse("x")).not.toThrow() })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", () => { expect(a).toBeDefined(); expect(b).toBeTruthy() })`,
      errors: existenceOnly,
    },
    {
      code: `test("t", () => { expect(result).toBeDefined() })`,
      errors: existenceOnly,
    },
    {
      code: `it.each([1, 2])("t %i", (n) => { expect(load(n)).toBeDefined() })`,
      errors: existenceOnly,
    },
    // O guarda existencial dentro de um callback aninhado não vira valor concreto.
    {
      code: `it("t", () => { list.forEach((row) => { expect(row.id).toBeDefined() }) })`,
      errors: existenceOnly,
    },
    // expect.assertions de um teste vizinho não isenta este.
    {
      code: `describe("d", () => {
  it("a", () => { expect.assertions(1); expect(x).toBeDefined() })
  it("b", () => { expect(y).toBeDefined() })
})`,
      errors: existenceOnly,
    },
  ],
})
