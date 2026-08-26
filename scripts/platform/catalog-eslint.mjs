import { spawnSync } from "node:child_process"
import { existsSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { listEntries } from "./lib/catalog-graph.mjs"
import { stage, STAGE_DIR } from "./catalog-stage.mjs"
import { isMain } from "./lib/is-main.mjs"

// Nome do config gerado dentro do próprio stage — nunca commitado, recriado a
// cada corrida (mesmo ciclo de vida do stage: `stage()` já apaga e recria
// `.catalog-stage/` do zero a cada chamada).
const GENERATED_CONFIG_FILENAME = "eslint.config.catalog.mjs"

// Padrão relativo à raiz de `apps/api` (onde o comando roda via `pnpm --filter
// api exec`) — mesmo prefixo que `stagePlan` usa para copiar cada entrada.
const LINT_PATTERN = `${path.basename(STAGE_DIR)}/src/modules/**/*.ts`

// O `apps/api/eslint.config.mjs` real ignora `.catalog-stage/**` (comentário lá:
// "Stage gerado por `pnpm catalog:typecheck`"), então o pacote de regras
// (`@workspace/eslint-config/nest` + `/vitest`, o mesmo que aquele arquivo
// compõe) nunca alcança essa árvore por ali. Este config gerado importa os dois
// arrays pelo caminho absoluto do pacote — não pelo specifier
// `@workspace/eslint-config/*`, que só resolveria a partir de dentro de
// `apps/api/node_modules` — e reaponta o parser type-aware para
// `tsconfig.catalog.json`, o mesmo programa que `catalog:typecheck` já confia.
function generatedConfigSource({ repoRoot }) {
  const nestConfigPath = path.join(repoRoot, "packages/eslint-config/nest.js")
  const vitestConfigPath = path.join(
    repoRoot,
    "packages/eslint-config/vitest.js"
  )
  const apiRoot = path.join(repoRoot, "apps/api")
  return `// Gerado por scripts/platform/catalog-eslint.mjs — não editar, não commitar.
import nestConfig from ${JSON.stringify(nestConfigPath)}
import { vitestNodeConfig } from ${JSON.stringify(vitestConfigPath)}

export default [
  ...nestConfig,
  ...vitestNodeConfig,
  {
    files: [${JSON.stringify(LINT_PATTERN)}],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["./tsconfig.catalog.json"],
        tsconfigRootDir: ${JSON.stringify(apiRoot)},
      },
    },
  },
  // Mesmo override que apps/api/eslint.config.mjs aplica a src/**: no rendered
  // child esta árvore vira exatamente isso.
  {
    files: [${JSON.stringify(LINT_PATTERN)}],
    rules: { "no-console": ["error", {}] },
  },
]
`
}

export function writeGeneratedConfig({ repoRoot, stageRoot }) {
  const configPath = path.join(stageRoot, GENERATED_CONFIG_FILENAME)
  writeFileSync(configPath, generatedConfigSource({ repoRoot }))
  return configPath
}

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

// Estagia as entradas (reaproveita `catalog-stage.mjs`, não duplica a cópia),
// gera o config equivalente ao do rendered child e roda o ESLint real do
// workspace `api` sobre a árvore estagiada — sem `--max-warnings`, a mesma
// severidade que `pnpm --filter api lint` já aplica no rendered child.
export function runCatalogEslint({
  repoRoot,
  entries,
  run = defaultRun,
  stdio = "inherit",
}) {
  const plan = stage({ repoRoot, entries })
  const configPath = writeGeneratedConfig({
    repoRoot,
    stageRoot: plan.stageRoot,
  })
  const result = run(
    "pnpm",
    ["--filter", "api", "exec", "eslint", "-c", configPath, LINT_PATTERN],
    { cwd: repoRoot, stdio }
  )
  return { ...result, plan }
}

if (isMain(import.meta.url, process.argv[1])) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  )
  const catalogRoot = path.join(repoRoot, "catalog")
  // O catálogo fica fora do copier: num produto gerado não existe `catalog/`,
  // e este gate (job Gates do ci.yml) não tem o que checar.
  if (!existsSync(catalogRoot)) {
    process.stdout.write(
      "catalog:eslint — sem catalog/ neste checkout, nada a checar\n"
    )
    process.exit(0)
  }

  const entries = listEntries(catalogRoot)
  process.stdout.write(
    `catalog:eslint — ${entries.length} entrada(s): ${entries.map((e) => e.name).join(", ")}\n`
  )

  const { status } = runCatalogEslint({ repoRoot, entries })
  if (!process.argv.includes("--keep"))
    rmSync(path.join(repoRoot, STAGE_DIR), { recursive: true, force: true })
  process.exit(status ?? 1)
}
