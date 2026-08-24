import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { readLock, writeLock } from "../lib/lock.mjs"

test("readLock retorna um lock vazio quando o arquivo não existe", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lock-test-"))
  const filePath = path.join(dir, ".platform-modules.lock")
  assert.deepEqual(readLock(filePath), { modules: {} })
})

test("writeLock + readLock fazem round-trip do conteúdo", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lock-test-"))
  const filePath = path.join(dir, ".platform-modules.lock")
  const lock = {
    catalog: { source: "gh:EmanuelVogt/platform-template", ref: "v1.0.0" },
    modules: {
      identity: {
        variant: "single-tenant",
        version: "1.0.0",
        installedAt: "2026-08-19T00:00:00.000Z",
        catalogRef: "v1.0.0",
        files: [
          {
            path: "apps/api/src/modules/identity/identity.module.ts",
            sha256: "abc123",
          },
        ],
        migrations: ["0003_identity_baseline"],
        webRoot: "apps/web/src/entities/identity",
      },
    },
  }

  writeLock(filePath, lock)

  assert.deepEqual(readLock(filePath), lock)
})
