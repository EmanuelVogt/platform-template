import { defineConfig } from "vitest/config"

import { apiDefaults, swcPlugin } from "./vitest.shared.mjs"

export default defineConfig({
  plugins: [swcPlugin()],
  test: {
    ...apiDefaults,
    name: "catalog",
    // Só o kernel staged por `catalog-stage.mjs`; `*.int-spec.ts` e
    // `*.e2e-spec.ts` terminam em `-spec.ts`, não em `.spec.ts` — os tiers
    // de banco ficam de fora sem precisar de exclude (mesmo truque do
    // `apps/api/vitest.config.mts`).
    include: [".catalog-stage/src/modules/**/*.spec.ts"],
    // `contract.parity.spec.ts` compara o snapshot de uma entrada contra o
    // `openapi.json` *renderizado* (gerado só depois de `module add` num
    // child real) — o contrato deste repo (o template) é kernel-only por
    // construção (o kernel nunca importa uma entrada de catalog), então
    // aqui ele nunca teria rotas pra comparar. Isso não é teoria: é
    // `pnpm catalog:check` — não este tier — quem prova que o teste
    // funciona; foi lá que a wave 11 pegou de verdade uma regressão real
    // (contract.parity.spec.ts:42, `listUsers` perdendo `servesClients`).
    // Fica staged (a árvore continua fiel ao layout instalado, pronta para
    // um futuro runner do tier do child) mas não coletado aqui.
    exclude: ["**/contract.parity.spec.ts"],
    setupFiles: ["./test/setup/unit-env.ts"],
    maxWorkers: 4,
  },
})
