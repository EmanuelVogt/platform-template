import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

import { stage } from "./scripts/platform/catalog-stage.mjs"
import { listEntries } from "./scripts/platform/lib/catalog-graph.mjs"

// Mesmo resolvedor de `vitest.config.mts`: `apps/web` no filho renderizado,
// `apps/web-vite` neste repositório do template.
const WEB_DIR =
  ["apps/web", "apps/web-vite"].find((dir) =>
    existsSync(`${dir}/vitest.config.ts`)
  ) ?? "apps/web"

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url))
const CATALOG_ROOT = path.join(REPO_ROOT, "catalog")
// Sem `catalog/` (produto renderizado, fora do copier) não há projeto de
// catálogo pra medir. Com ele, o stage é regerado aqui — a mesma árvore que
// `catalog:test` usa — porque um stage ausente ou velho faria este projeto
// coletar 0 arquivos e passar calado sob o piso de cobertura, repetindo o
// defeito que o tier de catalog/ existe para corrigir (vitest.catalog.mts).
const hasCatalog = existsSync(CATALOG_ROOT)
if (hasCatalog) {
  stage({ repoRoot: REPO_ROOT, entries: listEntries(CATALOG_ROOT) })
}

/**
 * `pnpm test:coverage`: os quatro projetos (cinco com `catalog/` presente)
 * num processo só, cobertura v8 mesclada e piso por glob. É o gate honesto —
 * o único run em que a linha de um arquivo coberto apenas pelo e2e conta
 * junto com a do unitário.
 */
export default defineConfig({
  test: {
    projects: [
      `${WEB_DIR}/vitest.config.ts`,
      "apps/api/vitest.config.mts",
      "apps/api/vitest.int.config.mts",
      "apps/api/vitest.e2e.config.mts",
      ...(hasCatalog ? ["apps/api/vitest.catalog.config.mts"] : []),
    ],
    globalSetup: ["apps/api/test/setup/global-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      // Sem isto o Vitest engole o relatório quando um teste falha, e o run que
      // mais precisa dos números — o vermelho — é o único que não os emite.
      reportOnFailure: true,
      // `include` explícito é o que faz arquivo sem teste entrar na conta: o
      // `coverage.all` do Vitest 3 não existe mais.
      include: [
        "apps/api/src/**/*.ts",
        `${WEB_DIR}/src/**/*.{ts,tsx}`,
        // Código de catalog/ só existe no disco staged (.catalog-stage/); é
        // esse caminho, não `catalog/**`, que o v8 credita como executado.
        ...(hasCatalog ? ["apps/api/.catalog-stage/src/modules/**/*.ts"] : []),
      ],
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
        `${WEB_DIR}/src/main.tsx`,
        "**/shared/test/**",
        // No filho, o barril de teste da entrada instalada cai dentro do glob
        // `apps/api/src/**` — sem esta linha ele entra no denominador de
        // cobertura como se fosse código de produção.
        "apps/api/src/modules/*/testing/**",
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
        // Ambos os globs agora alcançam 90 (api em 2026-08-22: 96.69 / 95.33 /
        // 94.92 / 96.84). A barra nunca é baixada para passar — o caminho é
        // cobrir, nunca afrouxar.
        "apps/api/src/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        [`${WEB_DIR}/src/**`]: {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
})
