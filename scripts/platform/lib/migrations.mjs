import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXIT_CODES } from "./exit-codes.mjs";

export class MigrationFailureError extends Error {
  constructor(step, output) {
    super(`falha ao gerar migrações (${step}): ${output}`);
    this.name = "MigrationFailureError";
    this.step = step;
    this.output = output;
    this.exitCode = EXIT_CODES.MIGRATION_FAILURE;
  }
}

function defaultRun(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return { status: result.status ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function migrationsDir(child) {
  return path.join(child, "apps/api/drizzle/migrations");
}

function nextJournalIndex(child) {
  const journalPath = path.join(migrationsDir(child), "meta/_journal.json");
  if (!existsSync(journalPath)) return 0;
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  return (journal.entries ?? []).length;
}

function paddedIndex(idx) {
  return String(idx).padStart(4, "0");
}

function slugFromCustomMigration(fileName) {
  return fileName.replace(/^\d+_/, "").replace(/\.sql$/, "");
}

function runStep(run, step, args, options) {
  const result = run("pnpm", args, options);
  if (result.status !== 0) {
    throw new MigrationFailureError(step, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
}

export function generateForModule(child, manifest, { catalogEntryRoot, run = defaultRun } = {}) {
  const options = { cwd: child };

  runStep(run, "check", ["--filter", "api", "exec", "drizzle-kit", "check"], options);

  const startIdx = nextJournalIndex(child);
  const baselineName = `${manifest.name}_baseline`;
  runStep(
    run,
    "generate:baseline",
    ["--filter", "api", "exec", "drizzle-kit", "generate", "--name", baselineName],
    options,
  );
  const generated = [`${paddedIndex(startIdx)}_${baselineName}.sql`];

  const customMigrations = manifest.customMigrations ?? [];
  customMigrations.forEach((fileName, i) => {
    const slug = slugFromCustomMigration(fileName);
    const customName = `${manifest.name}_${slug}`;
    runStep(
      run,
      `generate:custom:${fileName}`,
      ["--filter", "api", "exec", "drizzle-kit", "generate", "--custom", "--name", customName],
      options,
    );

    const generatedFileName = `${paddedIndex(startIdx + 1 + i)}_${customName}.sql`;
    const sourcePath = path.join(catalogEntryRoot, "migrations/custom", fileName);
    let shippedSql;
    try {
      shippedSql = readFileSync(sourcePath, "utf8");
    } catch (err) {
      throw new MigrationFailureError(
        `custom:${fileName}`,
        `SQL custom não encontrado em ${sourcePath}: ${err.message}`,
      );
    }
    const destPath = path.join(migrationsDir(child), generatedFileName);
    mkdirSync(path.dirname(destPath), { recursive: true });
    writeFileSync(destPath, shippedSql, "utf8");
    generated.push(generatedFileName);
  });

  runStep(run, "journal", ["--filter", "api", "run", "db:check:journal"], options);

  return generated;
}
