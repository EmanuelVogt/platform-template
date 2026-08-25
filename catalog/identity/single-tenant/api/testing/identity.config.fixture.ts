import { parseIdentityConfig } from "../identity.config"

import type { IdentityConfig } from "../identity.config"

/**
 * Config de teste derivada do env de `unit-env`, com overrides opcionais.
 * Mantém os use-cases desacoplados de `process.env` no unit test.
 */
export function makeIdentityConfig(
  over: Partial<IdentityConfig> = {}
): IdentityConfig {
  // BREACH_CHECK_ENABLED não tem default no schema; o fixture preenche o piso
  // para que um spec não precise conhecer o env inteiro, e o env vence.
  return {
    ...parseIdentityConfig({ BREACH_CHECK_ENABLED: "false", ...process.env }),
    ...over,
  }
}
