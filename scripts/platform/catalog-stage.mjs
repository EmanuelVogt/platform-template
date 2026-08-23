import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listEntries } from "./lib/catalog-graph.mjs";
import { KERNEL_STAGE_PATHS } from "./lib/child-layout.mjs";

export const STAGE_DIR = "apps/api/.catalog-stage";

export function stagePlan({ repoRoot, entries }) {
  const stageRoot = path.join(repoRoot, STAGE_DIR);
  return {
    stageRoot,
    links: KERNEL_STAGE_PATHS.map((rel) => ({
      from: path.join(repoRoot, "apps/api", rel),
      to: path.join(stageRoot, rel),
    })),
    copies: entries
      .map((entry) => ({ from: path.join(entry.dir, "api"), to: path.join(stageRoot, "src/modules", entry.name) }))
      .filter((copy) => existsSync(copy.from)),
  };
}

export function stage({ repoRoot, entries }) {
  const plan = stagePlan({ repoRoot, entries });
  rmSync(plan.stageRoot, { recursive: true, force: true });
  mkdirSync(path.join(plan.stageRoot, "src/modules"), { recursive: true });
  for (const link of plan.links) {
    mkdirSync(path.dirname(link.to), { recursive: true });
    symlinkSync(link.from, link.to);
  }
  for (const copy of plan.copies) cpSync(copy.from, copy.to, { recursive: true });
  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const catalogRoot = path.join(repoRoot, "catalog");
  // O catálogo fica fora do copier: num produto gerado não existe `catalog/`,
  // e este gate (pre-push do lefthook) não tem o que checar.
  if (!existsSync(catalogRoot)) {
    process.stdout.write("catalog:typecheck — sem catalog/ neste checkout, nada a checar\n");
    process.exit(0);
  }

  const entries = listEntries(catalogRoot);
  const plan = stage({ repoRoot, entries });
  process.stdout.write(`catalog:typecheck — ${plan.copies.length} entrada(s): ${entries.map((e) => e.name).join(", ")}\n`);

  const result = spawnSync("pnpm", ["--filter", "api", "exec", "tsc", "-p", "tsconfig.catalog.json", "--noEmit"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (!process.argv.includes("--keep")) rmSync(plan.stageRoot, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}
