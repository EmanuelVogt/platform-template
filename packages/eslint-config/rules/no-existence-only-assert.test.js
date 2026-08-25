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
    // `not.toThrow(<matcher>)` acompanhado de um valor concreto continua
    // legítimo — o corpo prova o que aconteceu, não só que nada explodiu.
    `it("t", () => { expect(() => parse("x")).not.toThrow(SyntaxError); expect(parse("x")).toEqual({ ok: true }) })`,
    // A declaração explícita é a saída documentada quando só há existência.
    `it("t", () => { expect.assertions(1); expect(result).toBeDefined() })`,
    `it("t", () => { expect.assertions(1); expect(() => parse("x")).not.toThrow(SyntaxError) })`,
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
    // Sozinho, `not.toThrow(<matcher>)` prova menos que a forma sem argumento:
    // passa se o código lançar outro erro. Não isenta o corpo.
    {
      code: `it("t", () => { expect(() => parse("x")).not.toThrow(SyntaxError) })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", () => { expect(() => parse("x")).not.toThrow(/inválido/i) })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", async () => { await expect(run()).resolves.not.toThrow(ConflictError) })`,
      errors: existenceOnly,
    },
    {
      code: `it("t", () => { expect(() => a()).not.toThrow(); expect(() => b()).not.toThrow(TypeError) })`,
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
