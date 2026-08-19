import { createHash } from "node:crypto"

import type { BreachCheck } from "../../domain/ports/breach-check"

export type BreachCheckMode = "fail_open" | "fail_closed"

/**
 * Have I Been Pwned via k-anonymity (spec §7): envia só os 5 primeiros chars
 * do sha1 da senha; nunca a senha. Em falha de rede respeita BREACH_CHECK_MODE:
 * fail_open => trata como não-vazada; fail_closed => trata como vazada.
 */
export class HibpBreachCheck implements BreachCheck {
  constructor(
    private readonly mode: BreachCheckMode,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async isBreached(password: string): Promise<boolean> {
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)
    try {
      const res = await this.fetchFn(
        `https://api.pwnedpasswords.com/range/${prefix}`,
        { headers: { "Add-Padding": "true" } }
      )
      if (!res.ok) throw new Error(`HIBP status ${res.status}`)
      const body = await res.text()
      // suffix já é UPPERCASE (sha1.toUpperCase); normaliza o token da resposta
      // p/ comparação case-insensitive — o contrato HIBP não garante o case.
      return body
        .split("\n")
        .some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix)
    } catch {
      // fail_open: deixa passar (false); fail_closed: bloqueia (true).
      return this.mode === "fail_closed"
    }
  }
}
