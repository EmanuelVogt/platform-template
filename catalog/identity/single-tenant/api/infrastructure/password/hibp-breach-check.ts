import { createHash } from "node:crypto"

import { BreachCheckUnavailableError } from "../../domain/errors"

import type {
  BreachCheck,
  BreachVerdict,
} from "../../domain/ports/breach-check"

export type BreachCheckMode = "fail_open" | "fail_closed"

/** Teto duro da consulta: o cadastro de senha não espera o HIBP indefinidamente. */
const LOOKUP_TIMEOUT_MS = 2000

/**
 * Have I Been Pwned via k-anonymity (spec §7): envia só os 5 primeiros chars
 * do sha1 da senha; nunca a senha. Falha de rede, status não-2xx ou estouro do
 * timeout não são veredito: sob `fail_open` viram "skipped", sob `fail_closed`
 * derrubam a operação com 503.
 */
export class HibpBreachCheck implements BreachCheck {
  constructor(
    private readonly mode: BreachCheckMode,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async check(password: string): Promise<BreachVerdict> {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)
    let body: string
    try {
      const res = await this.fetchFn(
        `https://api.pwnedpasswords.com/range/${prefix}`,
        {
          headers: { "Add-Padding": "true" },
          signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        }
      )
      if (!res.ok) throw new Error(`HIBP status ${res.status}`)
      body = await res.text()
    } catch {
      if (this.mode === "fail_closed") {
        throw new BreachCheckUnavailableError()
      }
      return "skipped"
    }
    // suffix já é UPPERCASE (sha1.toUpperCase); normaliza o token da resposta
    // p/ comparação case-insensitive — o contrato HIBP não garante o case.
    const hit = body
      .split("\n")
      .some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix)
    return hit ? "breached" : "clear"
  }
}
