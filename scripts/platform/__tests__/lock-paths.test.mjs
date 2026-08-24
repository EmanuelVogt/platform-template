import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { rollback, writeLock } from "../lib/apply.mjs"
import { readLock } from "../lib/lock.mjs"

function makeChild() {
  return mkdtempSync(path.join(tmpdir(), "lock-paths-child-"))
}

function writeModuleFile(child) {
  const filePath = path.join(
    child,
    "apps/api/src/modules/alpha/alpha.module.ts"
  )
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, "export class AlphaModule {}\n", "utf8")
  return filePath
}

test("writeLock com childRoot grava files[].path relativo ao child", () => {
  const child = makeChild()
  const filePath = writeModuleFile(child)
  const lockPath = path.join(child, ".platform-modules.lock")

  const nextLock = writeLock({
    lockPath,
    lock: { modules: {} },
    name: "alpha",
    entry: {
      version: "1.0.0",
      installedAt: "2026-08-19T00:00:00.000Z",
      catalogRef: "v1.0.0",
      files: [filePath],
      migrations: [],
    },
    childRoot: child,
  })

  assert.equal(
    nextLock.modules.alpha.files[0].path,
    "apps/api/src/modules/alpha/alpha.module.ts"
  )
})

test("o lock relido do disco preserva o caminho relativo gravado", () => {
  const child = makeChild()
  const filePath = writeModuleFile(child)
  const lockPath = path.join(child, ".platform-modules.lock")

  writeLock({
    lockPath,
    lock: { modules: {} },
    name: "alpha",
    entry: {
      version: "1.0.0",
      installedAt: "2026-08-19T00:00:00.000Z",
      catalogRef: "v1.0.0",
      files: [filePath],
      migrations: [],
    },
    childRoot: child,
  })

  const reread = readLock(lockPath)
  assert.equal(
    reread.modules.alpha.files[0].path,
    "apps/api/src/modules/alpha/alpha.module.ts"
  )
})

test("rollback com childRoot reancora o caminho relativo e remove o arquivo", () => {
  const child = makeChild()
  const filePath = writeModuleFile(child)
  const lockPath = path.join(child, ".platform-modules.lock")
  const lock = {
    modules: {
      alpha: {
        version: "1.0.0",
        installedAt: "2026-08-19T00:00:00.000Z",
        catalogRef: "v1.0.0",
        files: [
          { path: "apps/api/src/modules/alpha/alpha.module.ts", sha256: "x" },
        ],
        migrations: [],
      },
    },
  }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2), "utf8")

  const result = rollback({
    lockPath,
    name: "alpha",
    envExamplePath: path.join(child, ".env.example"),
    envPath: path.join(child, ".env"),
    registry: null,
    childRoot: child,
  })

  assert.equal(existsSync(filePath), false)
  assert.equal(result.modules.alpha, undefined)
})

test("um lock gravado com caminho absoluto (legado) ainda é revertível", () => {
  const child = makeChild()
  const filePath = writeModuleFile(child)
  const lockPath = path.join(child, ".platform-modules.lock")
  const lock = {
    modules: {
      alpha: {
        version: "1.0.0",
        installedAt: "2026-08-19T00:00:00.000Z",
        catalogRef: "v1.0.0",
        files: [{ path: filePath, sha256: "x" }],
        migrations: [],
      },
    },
  }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2), "utf8")

  rollback({
    lockPath,
    name: "alpha",
    envExamplePath: path.join(child, ".env.example"),
    envPath: path.join(child, ".env"),
    registry: null,
    childRoot: child,
  })

  assert.equal(existsSync(filePath), false)
})
