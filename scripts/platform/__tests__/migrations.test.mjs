import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readManifest } from "../lib/manifest.mjs";
import { EXIT_CODES } from "../lib/exit-codes.mjs";
import { MigrationFailureError, generateForModule } from "../lib/migrations.mjs";

const FIXTURES_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/catalog");
const alphaManifest = readManifest(path.join(FIXTURES_ROOT, "alpha", "module.json"));
const deltaManifest = readManifest(path.join(FIXTURES_ROOT, "delta", "module.json"));

const DRIZZLE_CUSTOM_STUB = "-- Custom SQL migration file, put your code below! --\n";

function makeChild(journalEntryCount = 2) {
  const child = mkdtempSync(path.join(tmpdir(), "migrations-child-"));
  const migrationsDir = path.join(child, "apps/api/drizzle/migrations");
  mkdirSync(path.join(migrationsDir, "meta"), { recursive: true });
  const entries = Array.from({ length: journalEntryCount }, (_, idx) => ({ idx, tag: `${idx}_kernel` }));
  writeFileSync(path.join(migrationsDir, "meta/_journal.json"), JSON.stringify({ entries }), "utf8");
  return child;
}

function makeStubRun(results = []) {
  const calls = [];
  const queue = [...results];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    return queue.shift() ?? { status: 0, stdout: "", stderr: "" };
  };
  return { run, calls };
}

function appendJournalEntry(child, name, { content }) {
  const dir = path.join(child, "apps/api/drizzle/migrations");
  const journalPath = path.join(dir, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const idx = journal.entries.length;
  const tag = `${String(idx).padStart(4, "0")}_${name}`;
  journal.entries.push({ idx, tag });
  writeFileSync(journalPath, JSON.stringify(journal), "utf8");
  writeFileSync(path.join(dir, `${tag}.sql`), content, "utf8");
  return tag;
}

// Simula o contrato do drizzle-kit que generateForModule observa: `generate` só anda o
// journal quando há diff de schema; `generate --custom` sempre registra 1 entrada com um
// stub vazio. O índice é o que o journal ditar, não o que o chamador previu.
function makeDrizzleStubRun(child, { baselineHasDiff = true } = {}) {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (args.includes("generate")) {
      const name = args[args.indexOf("--name") + 1];
      if (args.includes("--custom")) {
        appendJournalEntry(child, name, { content: DRIZZLE_CUSTOM_STUB });
      } else if (baselineHasDiff) {
        appendJournalEntry(child, name, { content: "-- baseline gerado\n" });
      }
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { run, calls };
}

test("generateForModule roda check, generate --name <module>_baseline e db:check:journal nessa ordem", () => {
  const child = makeChild(2);
  const { run, calls } = makeDrizzleStubRun(child);

  const generated = generateForModule(child, alphaManifest, { catalogEntryRoot: path.join(FIXTURES_ROOT, "alpha"), run });

  assert.deepEqual(
    calls.map((call) => [call.command, call.args]),
    [
      ["pnpm", ["--filter", "api", "exec", "drizzle-kit", "check"]],
      ["pnpm", ["--filter", "api", "exec", "drizzle-kit", "generate", "--name", "alpha_baseline"]],
      ["pnpm", ["--filter", "api", "run", "db:check:journal"]],
    ],
  );
  assert.ok(calls.every((call) => call.options.cwd === child));
  assert.deepEqual(generated, ["0002_alpha_baseline.sql"]);
});

test("generateForModule sem diff de schema devolve lista vazia — nenhum baseline fantasma para o lock", () => {
  const child = makeChild(2);
  const { run } = makeDrizzleStubRun(child, { baselineHasDiff: false });

  const generated = generateForModule(child, alphaManifest, { catalogEntryRoot: path.join(FIXTURES_ROOT, "alpha"), run });

  assert.deepEqual(generated, []);
  assert.ok(!existsSync(path.join(child, "apps/api/drizzle/migrations", "0002_alpha_baseline.sql")));
});

test("generateForModule aborta com exit 9 quando drizzle-kit check acusa drift, sem chamar generate", () => {
  const child = makeChild(2);
  const { run, calls } = makeStubRun([{ status: 1, stdout: "drift detectado\n", stderr: "" }]);

  assert.throws(
    () => generateForModule(child, alphaManifest, { catalogEntryRoot: path.join(FIXTURES_ROOT, "alpha"), run }),
    (err) => {
      assert.ok(err instanceof MigrationFailureError);
      assert.equal(err.exitCode, EXIT_CODES.MIGRATION_FAILURE);
      assert.equal(err.exitCode, 9);
      assert.match(err.output, /drift detectado/);
      return true;
    },
  );
  assert.equal(calls.length, 1);
});

test("generateForModule aborta com exit 9 quando db:check:journal falha após gerar", () => {
  const child = makeChild(2);
  const { run, calls } = makeStubRun([
    { status: 0, stdout: "", stderr: "" },
    { status: 0, stdout: "", stderr: "" },
    { status: 1, stdout: "", stderr: "journal inconsistente\n" },
  ]);

  assert.throws(
    () => generateForModule(child, alphaManifest, { catalogEntryRoot: path.join(FIXTURES_ROOT, "alpha"), run }),
    (err) => {
      assert.ok(err instanceof MigrationFailureError);
      assert.equal(err.exitCode, 9);
      assert.match(err.output, /journal inconsistente/);
      return true;
    },
  );
  assert.equal(calls.length, 3);
});

test("generateForModule gera uma migração --custom por entrada de customMigrations e sobrescreve o arquivo registrado no journal", () => {
  const child = makeChild(3);
  const { run, calls } = makeDrizzleStubRun(child);
  const catalogEntryRoot = path.join(FIXTURES_ROOT, "delta");

  const generated = generateForModule(child, deltaManifest, { catalogEntryRoot, run });

  assert.deepEqual(
    calls.map((call) => [call.command, call.args]),
    [
      ["pnpm", ["--filter", "api", "exec", "drizzle-kit", "check"]],
      ["pnpm", ["--filter", "api", "exec", "drizzle-kit", "generate", "--name", "delta_baseline"]],
      [
        "pnpm",
        ["--filter", "api", "exec", "drizzle-kit", "generate", "--custom", "--name", "delta_delta_events_append_only"],
      ],
      ["pnpm", ["--filter", "api", "run", "db:check:journal"]],
    ],
  );
  assert.deepEqual(generated, [
    "0003_delta_baseline.sql",
    "0004_delta_delta_events_append_only.sql",
  ]);

  const shippedSql = readFileSync(
    path.join(catalogEntryRoot, "migrations/custom/01_delta_events_append_only.sql"),
    "utf8",
  );
  const generatedFile = path.join(
    child,
    "apps/api/drizzle/migrations",
    "0004_delta_delta_events_append_only.sql",
  );
  assert.equal(readFileSync(generatedFile, "utf8"), shippedSql);
});

test("generateForModule com baseline sem diff grava o SQL custom no arquivo que o drizzle registrou — nada de órfão nem stub vazio", () => {
  const child = makeChild(3);
  const { run } = makeDrizzleStubRun(child, { baselineHasDiff: false });
  const catalogEntryRoot = path.join(FIXTURES_ROOT, "delta");

  const generated = generateForModule(child, deltaManifest, { catalogEntryRoot, run });

  assert.deepEqual(generated, ["0003_delta_delta_events_append_only.sql"]);

  const shippedSql = readFileSync(
    path.join(catalogEntryRoot, "migrations/custom/01_delta_events_append_only.sql"),
    "utf8",
  );
  const migrationsDir = path.join(child, "apps/api/drizzle/migrations");
  assert.equal(
    readFileSync(path.join(migrationsDir, "0003_delta_delta_events_append_only.sql"), "utf8"),
    shippedSql,
  );
  assert.ok(!existsSync(path.join(migrationsDir, "0004_delta_delta_events_append_only.sql")));

  const journal = JSON.parse(readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8"));
  assert.deepEqual(
    journal.entries.map((entry) => entry.tag).slice(3),
    ["0003_delta_delta_events_append_only"],
  );
});

test("generateForModule aborta com exit 9 quando generate --custom não registra entrada no journal", () => {
  const child = makeChild(3);
  const { run } = makeStubRun();
  const catalogEntryRoot = path.join(FIXTURES_ROOT, "delta");

  assert.throws(
    () => generateForModule(child, deltaManifest, { catalogEntryRoot, run }),
    (err) => {
      assert.ok(err instanceof MigrationFailureError);
      assert.equal(err.exitCode, EXIT_CODES.MIGRATION_FAILURE);
      assert.match(err.output, /registrou 0/);
      return true;
    },
  );
});

test("generateForModule lança MigrationFailureError tipada (exit 9) quando o SQL custom da entrada não existe, antes de gerar a migração", () => {
  const child = makeChild(3);
  const { run, calls } = makeStubRun();
  const catalogEntryRoot = path.join(FIXTURES_ROOT, "delta");
  const manifest = { name: "delta", customMigrations: ["99_arquivo_inexistente.sql"] };

  assert.throws(
    () => generateForModule(child, manifest, { catalogEntryRoot, run }),
    (err) => {
      assert.ok(err instanceof MigrationFailureError);
      assert.equal(err.exitCode, EXIT_CODES.MIGRATION_FAILURE);
      assert.match(err.message, /99_arquivo_inexistente\.sql/);
      return true;
    },
  );
  assert.ok(!calls.some((call) => call.args.includes("--custom")));
});
