import { defineConfig } from "vitest/config"

import { apiDefaults, swcPlugin } from "./vitest.shared.mjs"

// SPEC_DEVIATION: o exclude do fixture de branch descoberta é condicional, e
// não literal como o tasks.md descreve.
// Reason: `coverage-metric.contract.spec.ts` (COV-06) precisa rodar esse
// spec-fixture num processo próprio para medir a branch descoberta, e o
// `--exclude` do CLI do Vitest SOMA ao exclude do config em vez de
// substituí-lo. A flag só é ligada por aquele contrato.
const runsCoverageFixture = process.env.COVERAGE_METRIC_FIXTURE === "1"

export default defineConfig({
  plugins: [swcPlugin()],
  test: {
    ...apiDefaults,
    name: "api",
    // `*.int-spec.ts` e `*.e2e-spec.ts` terminam em `-spec.ts`, não em
    // `.spec.ts`: os tiers de banco ficam de fora sem precisar de exclude.
    include: ["src/**/*.spec.ts"],
    exclude: [
      // Amostra proposital de branch descoberta (contrato de cobertura).
      ...(runsCoverageFixture ? [] : ["**/if-else.sample.uncovered.spec.ts"]),
      // Árvore gerada pelo `catalog:typecheck`, fora de `src/`.
      ".catalog-stage/**",
      "**/node_modules/**",
    ],
    setupFiles: ["./test/setup/unit-env.ts"],
    maxWorkers: 4,
    // O Vitest recusa projetos com `maxWorkers` diferentes no mesmo grupo; o
    // `web` fica no grupo 0 (default) e os tiers da api vêm depois.
    sequence: { groupOrder: 1 },
  },
})
