import { WeakPasswordError } from "../../domain/errors"

import { checkBreach } from "./check-breach"

import type { BreachCheck } from "../../domain/ports/breach-check"
import { describe, expect, it, vi } from "vitest"

const breachReturning = (verdict: Awaited<ReturnType<BreachCheck["check"]>>) => ({
  check: vi.fn().mockResolvedValue(verdict),
})

describe("checkBreach", () => {
  it("'breached' vira WeakPasswordError com a mensagem da política", async () => {
    const breach = breachReturning("breached")
    const error = await checkBreach(breach, "senha-vazada")
      .then(() => null)
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(WeakPasswordError)
    expect((error as WeakPasswordError).message).toContain(
      "vazamentos conhecidos",
    )
  })

  it("'clear' devolve 'clear' e não lança", async () => {
    await expect(checkBreach(breachReturning("clear"), "s")).resolves.toBe(
      "clear",
    )
  })

  it("'skipped' devolve 'skipped' — a lacuna sobe para o caller auditar", async () => {
    await expect(checkBreach(breachReturning("skipped"), "s")).resolves.toBe(
      "skipped",
    )
  })

  it("repassa a senha para a porta sem transformá-la", async () => {
    const breach = breachReturning("clear")
    await checkBreach(breach, "  Senha Com Espaço  ")
    expect(breach.check).toHaveBeenCalledWith("  Senha Com Espaço  ")
  })
})
