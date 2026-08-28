import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { listEntries } from "./lib/catalog-graph.mjs"
import { KERNEL_STAGE_PATHS } from "./lib/child-layout.mjs"
import { isMain } from "./lib/is-main.mjs"

export const STAGE_DIR = "apps/api/.catalog-stage"

// `stageRoot` é opcional: omitido, o destino é o de sempre — byte-compatível
// com o CLI (`catalog:typecheck`/`catalog:test`). Existe para testes rodados
// em paralelo por `node --test`, que senão disputariam o mesmo
// `apps/api/.catalog-stage` físico (EEXIST/ENOTEMPTY intermitentes).
export function stagePlan({
  repoRoot,
  entries,
  stageRoot = path.join(repoRoot, STAGE_DIR),
}) {
  return {
    stageRoot,
    links: KERNEL_STAGE_PATHS.map((rel) => ({
      from: path.join(repoRoot, "apps/api", rel),
      to: path.join(stageRoot, rel),
    })),
    copies: entries
      .flatMap((entry) => [
        {
          from: path.join(entry.dir, "api"),
          to: path.join(stageRoot, "src/modules", entry.name),
        },
        // Mesmo destino que o instalador real usa para `catalog/<entrada>/parity`
        // (child-layout.mjs `parityDir`, consumido por lib/plan.mjs): `__parity__`
        // como irmão de application/domain/infrastructure. É o que faz os imports
        // relativos de `*.parity.spec.ts` (`../infrastructure/...`,
        // `../../../shared/test/parity/...`) resolverem igual no stage e no
        // produto instalado — sem isso a suíte de paridade nunca é coletada.
        {
          from: path.join(entry.dir, "parity"),
          to: path.join(stageRoot, "src/modules", entry.name, "__parity__"),
        },
      ])
      .filter((copy) => existsSync(copy.from)),
  }
}

// rmSync recursivo pode ver ENOTEMPTY ao remover STAGE_DIR quando a árvore
// ainda carrega os symlinks de KERNEL_STAGE_PATHS (test/, src/shared, ...)
// de uma execução anterior — o walk recursivo não é garantia de tratar um
// symlink para diretório como folha nessa combinação. Desfaz os links
// conhecidos primeiro (unlink direto, sem descer no alvo) e só então remove o
// resto da árvore; `maxRetries`/`retryDelay` cobrem a corrida real quando
// outro worker estagia a mesma árvore compartilhada ao mesmo tempo.
function removeStageTree(plan) {
  for (const link of plan.links)
    rmSync(link.to, { recursive: true, force: true })
  rmSync(plan.stageRoot, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  })
}

export function stage({ repoRoot, entries, stageRoot }) {
  const plan = stagePlan({ repoRoot, entries, stageRoot })
  removeStageTree(plan)
  mkdirSync(path.join(plan.stageRoot, "src/modules"), { recursive: true })
  for (const link of plan.links) {
    mkdirSync(path.dirname(link.to), { recursive: true })
    symlinkSync(link.from, link.to)
  }
  for (const copy of plan.copies)
    cpSync(copy.from, copy.to, { recursive: true })
  return plan
}

if (isMain(import.meta.url, process.argv[1])) {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  )
  const catalogRoot = path.join(repoRoot, "catalog")
  // O catálogo fica fora do copier: num produto gerado não existe `catalog/`,
  // e este gate (pre-push do lefthook) não tem o que checar.
  if (!existsSync(catalogRoot)) {
    process.stdout.write(
      "catalog:typecheck — sem catalog/ neste checkout, nada a checar\n"
    )
    process.exit(0)
  }

  const entries = listEntries(catalogRoot)
  const plan = stage({ repoRoot, entries })
  process.stdout.write(
    `catalog:typecheck — ${plan.copies.length} entrada(s): ${entries.map((e) => e.name).join(", ")}\n`
  )

  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "api",
      "exec",
      "tsc",
      "-p",
      "tsconfig.catalog.json",
      "--noEmit",
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    }
  )
  if (!process.argv.includes("--keep")) removeStageTree(plan)
  process.exit(result.status ?? 1)
}
