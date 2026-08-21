import { sameUnorderedKeys } from "./set-equal"

describe("sameUnorderedKeys", () => {
  it("retorna true para mesmas chaves em ordem diferente", () => {
    expect(sameUnorderedKeys(["b", "a"], ["a", "b"])).toBe(true)
  })

  it("retorna false quando tamanhos diferem", () => {
    expect(sameUnorderedKeys(["a"], ["a", "b"])).toBe(false)
  })

  it("conta multiplicidade — duplicatas importam", () => {
    expect(sameUnorderedKeys(["a", "a"], ["a"])).toBe(false)
    expect(sameUnorderedKeys(["a", "a"], ["a", "a"])).toBe(true)
  })
})
