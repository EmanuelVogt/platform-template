import { defineConfig } from "vitest/config"

import { dbTierDefaults, swcPlugin } from "./vitest.shared.mjs"

export default defineConfig({
  plugins: [swcPlugin()],
  test: {
    ...dbTierDefaults,
    name: "api-e2e",
    include: ["test/**/*.e2e-spec.ts", "src/**/*.e2e-spec.ts"],
    // `e2e-after-env.ts` registra hooks: no Vitest um setupFile vale para todo
    // arquivo de teste do projeto (não existe a distinção setupFilesAfterEnv).
    setupFiles: ["./test/setup/e2e-env.ts", "./test/setup/e2e-after-env.ts"],
    // Um arquivo por vez, no banco base — as suítes bootam o AppModule inteiro
    // e truncam tabelas. `pool: "forks"` e `isolate` ficam no default: fork
    // novo por arquivo, o que aposenta o `workerIdleMemoryLimit` do Jest.
    fileParallelism: false,
    maxWorkers: 1,
    // Grupo próprio: `maxWorkers` diferente do dos outros projetos.
    sequence: { groupOrder: 2 },
  },
})
