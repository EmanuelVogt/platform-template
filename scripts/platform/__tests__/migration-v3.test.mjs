import assert from "node:assert/strict"
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { run } from "../migrations/v3.0.0.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const CHILD_FIXTURE = path.join(TESTS_DIR, "fixtures/child")

function makeChild(envContent) {
  const dir = mkdtempSync(path.join(tmpdir(), "migration-v3-"))
  cpSync(CHILD_FIXTURE, dir, { recursive: true })
  writeFileSync(path.join(dir, "apps", "api", ".env"), envContent, "utf8")
  return dir
}

function readEnv(dir) {
  return readFileSync(path.join(dir, "apps", "api", ".env"), "utf8")
}

test("renomeia R2_* para STORAGE_* e preserva o fuso anterior quando APP_TIMEZONE está ausente", async () => {
  const dir = makeChild(
    "R2_ACCESS_KEY_ID=key\nR2_SECRET_ACCESS_KEY=secret\nR2_BUCKET=bucket\nR2_ENDPOINT=https://r2.example.com\n"
  )

  await run({ cwd: dir, log: () => {} })

  const env = readEnv(dir)
  assert.match(env, /^STORAGE_ACCESS_KEY_ID=key$/m)
  assert.match(env, /^STORAGE_SECRET_ACCESS_KEY=secret$/m)
  assert.match(env, /^STORAGE_BUCKET=bucket$/m)
  assert.match(env, /^STORAGE_ENDPOINT=https:\/\/r2\.example\.com$/m)
  assert.doesNotMatch(env, /^R2_/m)
  assert.match(env, /^APP_TIMEZONE=America\/Sao_Paulo$/m)
  assert.doesNotMatch(env, /^APP_TIMEZONE=UTC$/m)
})

test("rodar duas vezes produz uma árvore idêntica byte a byte", async () => {
  const dir = makeChild(
    "R2_ACCESS_KEY_ID=key\nR2_BUCKET=bucket\nR2_ENDPOINT=https://r2.example.com\nR2_SECRET_ACCESS_KEY=secret\n"
  )

  await run({ cwd: dir, log: () => {} })
  const firstRun = readEnv(dir)

  await run({ cwd: dir, log: () => {} })
  const secondRun = readEnv(dir)

  assert.equal(secondRun, firstRun)
})

test("não sobrescreve um APP_TIMEZONE já declarado pelo filho", async () => {
  const dir = makeChild("APP_TIMEZONE=Europe/Lisbon\n")

  await run({ cwd: dir, log: () => {} })

  const env = readEnv(dir)
  assert.match(env, /^APP_TIMEZONE=Europe\/Lisbon$/m)
  assert.equal(env.match(/^APP_TIMEZONE=/gm).length, 1)
})

test("oferece o escape hatch de cookie quando nem COOKIE_NAME nem CSRF_COOKIE_NAME estão declarados", async () => {
  const dir = makeChild("PORT=3000\n")

  await run({ cwd: dir, log: () => {} })

  const env = readEnv(dir)
  assert.match(env, /^# COOKIE_NAME=$/m)
  assert.match(env, /^# CSRF_COOKIE_NAME=$/m)
  assert.match(env, /ADV-20260824-03\.md/)
})

test("não sobrescreve um filho que já renomeou o cookie de sessão pelo COOKIE_NAME dele", async () => {
  const dir = makeChild("COOKIE_NAME=__Host-rit_session\n")

  await run({ cwd: dir, log: () => {} })

  const env = readEnv(dir)
  assert.match(env, /^COOKIE_NAME=__Host-rit_session$/m)
  assert.equal(env.match(/^COOKIE_NAME=/gm).length, 1)
  assert.doesNotMatch(env, /CSRF_COOKIE_NAME/)
})

test("registra explicitamente o passo manual do enum professional, apontando pra advisory", async () => {
  const dir = makeChild("PORT=3000\n")
  const messages = []

  await run({ cwd: dir, log: (message) => messages.push(message) })

  assert.ok(
    messages.some(
      (message) =>
        message.includes("ADV-20260824-01.md") &&
        message.includes("access_profile")
    )
  )
})
