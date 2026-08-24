import { WeakPasswordError } from "../../domain/errors"

import type { BreachCheck } from "../../domain/ports/breach-check"

/** Vereditos que deixam o fluxo seguir: verificada e limpa, ou não verificada. */
export type BreachOutcome = "clear" | "skipped"

/**
 * Ponte entre a porta e a política de senha: "breached" é o único veredito que
 * barra. "skipped" volta para quem chamou porque a lacuna é auditável e só o
 * use case sabe a quem atribuí-la.
 */
export async function checkBreach(
  breach: BreachCheck,
  password: string
): Promise<BreachOutcome> {
  const verdict = await breach.check(password)
  if (verdict === "breached") {
    throw new WeakPasswordError("Esta senha apareceu em vazamentos conhecidos.")
  }
  return verdict
}
