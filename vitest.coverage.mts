import { defineConfig } from "vitest/config"

/**
 * `pnpm test:coverage`: os quatro projetos num processo só, cobertura v8
 * mesclada e piso por glob. É o gate honesto — o único run em que a linha de
 * um arquivo coberto apenas pelo e2e conta junto com a do unitário.
 */
export default defineConfig({
  test: {
    projects: [
      "apps/web/vitest.config.ts",
      "apps/api/vitest.config.mts",
      "apps/api/vitest.int.config.mts",
      "apps/api/vitest.e2e.config.mts",
    ],
    globalSetup: ["apps/api/test/setup/global-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      // `include` explícito é o que faz arquivo sem teste entrar na conta: o
      // `coverage.all` do Vitest 3 não existe mais.
      include: ["apps/api/src/**/*.ts", "apps/web/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.spec.ts",
        "**/*.int-spec.ts",
        "**/*.e2e-spec.ts",
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/*.fixture.ts",
        "apps/api/src/main.ts",
        "apps/api/src/db/**",
        // Entry-point de CLI que escreve openapi.json em disco — mesma
        // natureza de apps/api/src/db/**; o builder que ele encapsula
        // (openapi-config.ts) continua no denominador.
        "apps/api/src/openapi/export-openapi.ts",
        // Fixtures do contrato de coverage-metric, medidas pelo run aninhado
        // que coverage-metric.contract.spec.ts dispara; if-else.sample.ts
        // precisa ficar descoberto no run externo (COV-06).
        "apps/api/src/shared/config/coverage-metric/*.sample.ts",
        "apps/web/src/main.tsx",
        "**/shared/test/**",
        "apps/api/test/**",
      ],
      // Barra única de 90 (AD-027, decisão do dono em 2026-08-22, precedente
      // ailapidus): global + um piso por glob, os quatro na mesma altura. Não
      // baixar para passar no gate — o caminho é cobrir, nunca afrouxar.
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
        // A api ainda não alcança a barra (branches 74.21% em 2026-08-22): o
        // pre-push fica vermelho de propósito até a test-suite-refactor cobrir
        // a lacuna. É a barra que puxa o teste, não o contrário.
        "apps/api/src/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "apps/web/src/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
})
