import { defineConfig } from "vitest/config"

/**
 * `pnpm catalog:test`: tier separado do `catalog/**` — NÃO entra em
 * `vitest.config.mts` porque `.catalog-stage` é árvore gerada; um stage
 * ausente ou velho faria este tier coletar 0 arquivos e passar, repetindo o
 * defeito que este tier existe para corrigir. Por isso `catalog:test`
 * re-gera o stage a cada execução antes de invocar este config.
 */
export default defineConfig({
  test: {
    projects: ["apps/api/vitest.catalog.config.mts"],
  },
})
