import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { run } from "../cli.mjs"
import {
  discoverMigrationScripts,
  templateMigrateCommand,
} from "../lib/commands/template-migrate.mjs"
import { EXIT_CODES } from "../lib/exit-codes.mjs"

// Script fixture idempotente: na primeira execução grava sua versão em
// order.log e cria um marcador; nas execuções seguintes, se o marcador já
// existir, é um no-op (a idempotência é responsabilidade do próprio script).
function idempotentScript(version) {
  return `import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
export async function run({ cwd, log }) {
  const marker = path.join(cwd, ".applied-${version}");
  if (existsSync(marker)) {
    log("${version} já aplicada — no-op");
    return;
  }
  writeFileSync(path.join(cwd, "order.log"), "${version}\\n", { flag: "a" });
  writeFileSync(marker, "applied", "utf8");
}
`
}

function failingScript() {
  return `export async function run() {
  throw new Error("boom");
}
`
}

function makeChild({ commit = "v2.8.0" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "template-migrate-"))
  writeFileSync(
    path.join(dir, ".copier-answers.yml"),
    `_src_path: gh:acme/platform-template\n_commit: ${commit}\n`,
    "utf8"
  )
  return dir
}

function writeMigration(dir, version, content) {
  const migrationsDir = path.join(dir, "scripts", "platform", "migrations")
  mkdirSync(migrationsDir, { recursive: true })
  writeFileSync(path.join(migrationsDir, `${version}.mjs`), content, "utf8")
}

test("roda scripts v2.9.0 e v3.0.0 em ordem ascendente até --target", async () => {
  const dir = makeChild()
  writeMigration(dir, "v2.9.0", idempotentScript("v2.9.0"))
  writeMigration(dir, "v3.0.0", idempotentScript("v3.0.0"))

  const exit = await templateMigrateCommand({
    options: { target: "v3.0.0" },
    cwd: dir,
    log: () => {},
  })

  assert.equal(exit, EXIT_CODES.OK)
  const order = readFileSync(path.join(dir, "order.log"), "utf8")
  assert.equal(order, "v2.9.0\nv3.0.0\n")
})

test("re-execução de uma migração já aplicada é no-op", async () => {
  const dir = makeChild()
  writeMigration(dir, "v2.9.0", idempotentScript("v2.9.0"))
  writeMigration(dir, "v3.0.0", idempotentScript("v3.0.0"))

  await templateMigrateCommand({
    options: { target: "v3.0.0" },
    cwd: dir,
    log: () => {},
  })
  const firstRun = readFileSync(path.join(dir, "order.log"), "utf8")

  const secondExit = await templateMigrateCommand({
    options: { target: "v3.0.0" },
    cwd: dir,
    log: () => {},
  })
  const secondRun = readFileSync(path.join(dir, "order.log"), "utf8")

  assert.equal(secondExit, EXIT_CODES.OK)
  assert.equal(secondRun, firstRun)
})

test("script que falha para a execução e nomeia o script; os seguintes não rodam", async () => {
  const dir = makeChild()
  writeMigration(dir, "v2.9.0", failingScript())
  writeMigration(dir, "v3.0.0", idempotentScript("v3.0.0"))

  let stderr = ""
  const originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => {
    stderr += chunk
    return true
  }
  let exit
  try {
    exit = await templateMigrateCommand({
      options: { target: "v3.0.0" },
      cwd: dir,
      log: () => {},
    })
  } finally {
    process.stderr.write = originalWrite
  }

  assert.equal(exit, EXIT_CODES.MIGRATION_FAILURE)
  assert.match(stderr, /v2\.9\.0/)
  assert.equal(existsSync(path.join(dir, ".applied-v3.0.0")), false)
})

test("sem diretório de migrações: no-op com sucesso", async () => {
  const dir = makeChild()
  const exit = await templateMigrateCommand({ cwd: dir, log: () => {} })
  assert.equal(exit, EXIT_CODES.OK)
  assert.deepEqual(
    discoverMigrationScripts(
      path.join(dir, "scripts", "platform", "migrations")
    ),
    []
  )
})

test("registrado no cli: run(['template', 'migrate', ...]) chega ao comando", async () => {
  const dir = makeChild()
  writeMigration(dir, "v2.9.0", idempotentScript("v2.9.0"))

  const exit = await run(["template", "migrate", "--target", "v2.9.0"], {
    cwd: dir,
  })

  assert.equal(exit, EXIT_CODES.OK)
  assert.equal(existsSync(path.join(dir, ".applied-v2.9.0")), true)
})
