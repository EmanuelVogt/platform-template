import swc from "unplugin-swc"

import type { InlineConfig } from "vitest/node"

/**
 * Espelha `apps/api/.swcrc` — decorators legados + `decoratorMetadata` são o
 * que faz a DI do Nest funcionar no teste — trocando só o formato de módulo:
 * o Vite trabalha com ESM. `swcrc: false` mantém as duas configurações
 * independentes (o build por `nest build` continua lendo o `.swcrc`).
 */
export const swcPlugin = () =>
  swc.vite({
    swcrc: false,
    module: { type: "es6" },
    jsc: {
      target: "es2023",
      parser: { syntax: "typescript", decorators: true, dynamicImport: true },
      transform: {
        legacyDecorator: true,
        decoratorMetadata: true,
        useDefineForClassFields: true,
      },
      keepClassNames: true,
    },
  })

/** Base dos três tiers da api: Node puro, sem globais implícitos. */
export const apiDefaults: InlineConfig = {
  environment: "node",
  globals: false,
}

/**
 * Tiers que falam com container: subir Postgres/Redis e aplicar as migrations
 * cabe nos hooks, e o `hookTimeout` do Vitest é 10s (o `testTimeout: 120000`
 * do Jest cobria hook e teste com um número só).
 */
export const dbTierDefaults: InlineConfig = {
  ...apiDefaults,
  testTimeout: 120_000,
  hookTimeout: 120_000,
}
