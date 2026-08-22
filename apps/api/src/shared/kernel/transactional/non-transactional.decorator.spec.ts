import { NonTransactional } from "./transactional.decorator"
import { describe, expect, it } from "vitest"

describe("@NonTransactional — declara ausência de transação, com motivo", () => {
  it("não embrulha o método: o corpo original roda intacto", async () => {
    class Subject {
      @NonTransactional("io externo: stream do storage")
      async execute(): Promise<string> {
        return Promise.resolve("ok")
      }
    }

    await expect(new Subject().execute()).resolves.toBe("ok")
  })

  it("motivo vazio ou só espaço lança na definição da classe", () => {
    expect(() => NonTransactional("")).toThrow(
      "@NonTransactional exige um motivo não vazio"
    )
    expect(() => NonTransactional("   ")).toThrow(
      "@NonTransactional exige um motivo não vazio"
    )
  })
})
