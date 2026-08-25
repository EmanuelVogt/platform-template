import { describe, expect, it, vi } from "vitest"

import { waitFor } from "./wait-for"

describe("waitFor", () => {
  it("devolve o primeiro valor definido", async () => {
    const values = [undefined, undefined, "pronto"]
    const fn = vi.fn(() => Promise.resolve(values.shift()))

    await expect(waitFor(fn, { intervalMs: 1 })).resolves.toBe("pronto")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("estoura o prazo nomeando o que esperava e por quanto tempo", async () => {
    await expect(
      waitFor(() => undefined, {
        timeoutMs: 20,
        intervalMs: 1,
        label: "o e-mail sair",
      })
    ).rejects.toThrow("waitFor: o e-mail sair não ocorreu em 20ms")
  })

  it("uma exceção no meio não interrompe a espera, e vira a causa do timeout", async () => {
    const fn = vi.fn(() => {
      throw new Error("banco ainda subindo")
    })

    await expect(waitFor(fn, { timeoutMs: 20, intervalMs: 1 })).rejects.toThrow(
      "última falha: banco ainda subindo"
    )
    expect(fn.mock.calls.length).toBeGreaterThan(1)
  })

  it("false conta como não-pronto, não como valor", async () => {
    const values: unknown[] = [false, false, 1]
    const fn = vi.fn(() => values.shift())

    await expect(waitFor(fn, { intervalMs: 1 })).resolves.toBe(1)
  })
})
