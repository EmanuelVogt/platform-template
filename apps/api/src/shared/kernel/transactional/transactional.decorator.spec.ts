import { describe, expect, it } from "vitest"

import { Transactional } from "./transactional.decorator"

describe("@Transactional (fail-loud)", () => {
  it("NODE_ENV=test sem manager: pass-through, executa direto", async () => {
    class Svc {
      @Transactional()
      run(): Promise<number> {
        return Promise.resolve(42)
      }
    }
    await expect(new Svc().run()).resolves.toBe(42)
  })

  it("fora de teste sem manager registrado: throw fail-loud", () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      class Svc {
        @Transactional()
        run(): Promise<number> {
          return Promise.resolve(42)
        }
      }
      expect(() => new Svc().run()).toThrow(/TransactionManager/)
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})
