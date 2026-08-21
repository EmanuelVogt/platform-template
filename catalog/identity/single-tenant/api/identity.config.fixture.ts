import { parseIdentityConfig } from "./identity.config"

import type { IdentityConfig } from "./identity.config"

/**
 * Config de teste derivada do env de `unit-env`, com overrides opcionais.
 * Mantém os use-cases desacoplados de `process.env` no unit test.
 */
export function makeIdentityConfig(
  over: Partial<IdentityConfig> = {},
): IdentityConfig {
  return { ...parseIdentityConfig(process.env), ...over }
}
