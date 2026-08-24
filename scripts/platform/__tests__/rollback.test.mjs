import assert from "node:assert/strict"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { run } from "../cli.mjs"
import { EXIT_CODES } from "../lib/exit-codes.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const CATALOG_ROOT = path.join(TESTS_DIR, "fixtures/catalog")
const CHILD_FIXTURE = path.join(TESTS_DIR, "fixtures/child")
const UNREACHABLE_CATALOG = path.join(TESTS_DIR, "fixtures/no-such-catalog")

function makeChild() {
  const dir = mkdtempSync(path.join(tmpdir(), "rollback-child-"))
  cpSync(CHILD_FIXTURE, dir, { recursive: true })
  renameSync(
    path.join(dir, "copier-answers.yml"),
    path.join(dir, ".copier-answers.yml")
  )
  return dir
}

function moduleFile(child, name) {
  return path.join(child, `apps/api/src/modules/${name}/${name}.module.ts`)
}

function lockOf(child) {
  return JSON.parse(
    readFileSync(path.join(child, ".platform-modules.lock"), "utf8")
  )
}

function platformModulesOf(child) {
  return readFileSync(
    path.join(child, "apps/api/src/platform-modules.ts"),
    "utf8"
  )
}

function stubRun() {
  return () => ({ status: 0, stdout: "", stderr: "" })
}

async function installModule(child, name) {
  return run(["module", "add", name, "--catalog-ref", CATALOG_ROOT], {
    cwd: child,
    run: stubRun(),
  })
}

async function rollbackModule(child, name, catalogRef) {
  return run(
    ["module", "add", name, "--catalog-ref", catalogRef, "--rollback"],
    {
      cwd: child,
      run: stubRun(),
    }
  )
}

async function installWithDeps(child, name) {
  return run(
    ["module", "add", name, "--catalog-ref", CATALOG_ROOT, "--with-deps"],
    { cwd: child, run: stubRun() }
  )
}

async function rollbackModuleWithDeps(child, name, catalogRef) {
  return run(
    [
      "module",
      "add",
      name,
      "--catalog-ref",
      catalogRef,
      "--rollback",
      "--with-deps",
    ],
    { cwd: child, run: stubRun() }
  )
}

test("rollback com catálogo inacessível retorna um código de falha, não OK", async () => {
  const child = makeChild()
  assert.equal(await installModule(child, "alpha"), EXIT_CODES.OK)

  const exitCode = await rollbackModule(child, "alpha", UNREACHABLE_CATALOG)

  assert.equal(exitCode, EXIT_CODES.CATALOG_UNREACHABLE)
})

test("rollback com catálogo inacessível preserva PLATFORM_MODULES quando outro módulo segue instalado", async () => {
  const child = makeChild()
  assert.equal(await installModule(child, "alpha"), EXIT_CODES.OK)
  assert.equal(await installModule(child, "beta"), EXIT_CODES.OK)

  await rollbackModule(child, "beta", UNREACHABLE_CATALOG)

  const platformModules = platformModulesOf(child)
  assert.match(platformModules, /AlphaModule/)
  assert.match(platformModules, /BetaModule/)
  assert.doesNotMatch(platformModules, /PLATFORM_MODULES = \[\] as const/)
})

test("rollback com catálogo inacessível não remove os arquivos nem a entrada do lock do módulo revertido", async () => {
  const child = makeChild()
  assert.equal(await installModule(child, "alpha"), EXIT_CODES.OK)
  assert.equal(await installModule(child, "beta"), EXIT_CODES.OK)

  await rollbackModule(child, "beta", UNREACHABLE_CATALOG)

  assert.equal(existsSync(moduleFile(child, "beta")), true)
  assert.ok(lockOf(child).modules.beta)
})

test("rollback com catálogo acessível remove só o módulo revertido, preservando os demais no registro", async () => {
  const child = makeChild()
  assert.equal(await installModule(child, "alpha"), EXIT_CODES.OK)
  assert.equal(await installModule(child, "beta"), EXIT_CODES.OK)

  const exitCode = await rollbackModule(child, "beta", CATALOG_ROOT)

  assert.equal(exitCode, EXIT_CODES.OK)
  const platformModules = platformModulesOf(child)
  assert.match(platformModules, /AlphaModule/)
  assert.doesNotMatch(platformModules, /BetaModule/)
  assert.equal(lockOf(child).modules.beta, undefined)
})

test("rollback --with-deps desfaz a cadeia inteira instalada junto (beta e sua dependência alpha)", async () => {
  const child = makeChild()
  assert.equal(await installWithDeps(child, "beta"), EXIT_CODES.OK)
  assert.ok(lockOf(child).modules.alpha)

  const exitCode = await rollbackModuleWithDeps(child, "beta", CATALOG_ROOT)

  assert.equal(exitCode, EXIT_CODES.OK)
  assert.equal(existsSync(moduleFile(child, "alpha")), false)
  assert.equal(existsSync(moduleFile(child, "beta")), false)
  const lock = lockOf(child)
  assert.equal(lock.modules.alpha, undefined)
  assert.equal(lock.modules.beta, undefined)
  assert.doesNotMatch(platformModulesOf(child), /AlphaModule|BetaModule/)
})

test("rollback --with-deps recusa quando um arquivo da cadeia foi editado localmente, apontando `git checkout` como saída", async () => {
  const child = makeChild()
  assert.equal(await installWithDeps(child, "beta"), EXIT_CODES.OK)
  writeFileSync(
    moduleFile(child, "alpha"),
    "// edição local\nexport class AlphaModule {}\n",
    "utf8"
  )

  let stderr = ""
  const originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => {
    stderr += chunk
    return true
  }
  let exitCode
  try {
    exitCode = await rollbackModuleWithDeps(child, "beta", CATALOG_ROOT)
  } finally {
    process.stderr.write = originalWrite
  }

  assert.equal(exitCode, EXIT_CODES.DESTINATION_EXISTS)
  assert.match(stderr, /git checkout/)
  assert.equal(existsSync(moduleFile(child, "alpha")), true)
  assert.equal(existsSync(moduleFile(child, "beta")), true)
  assert.ok(lockOf(child).modules.alpha)
  assert.ok(lockOf(child).modules.beta)
})

test("rollback sem --with-deps continua revertendo só o módulo indicado, preservando a dependência instalada", async () => {
  const child = makeChild()
  assert.equal(await installWithDeps(child, "beta"), EXIT_CODES.OK)

  const exitCode = await rollbackModule(child, "beta", CATALOG_ROOT)

  assert.equal(exitCode, EXIT_CODES.OK)
  assert.equal(existsSync(moduleFile(child, "beta")), false)
  assert.equal(existsSync(moduleFile(child, "alpha")), true)
  assert.ok(lockOf(child).modules.alpha)
  assert.equal(lockOf(child).modules.beta, undefined)
})
