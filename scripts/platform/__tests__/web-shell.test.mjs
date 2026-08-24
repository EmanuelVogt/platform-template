import test from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  assertWebShell,
  InvalidWebStackError,
  parseWebStack,
  WebShellMismatchError,
} from "../lib/web-shell.mjs"

function tmpChild() {
  return mkdtempSync(path.join(tmpdir(), "web-shell-fixture-"))
}

function writeWebShell(
  childDir,
  { name = "web", configFile, extraFiles = {} } = {}
) {
  const webDir = path.join(childDir, "apps", "web")
  mkdirSync(webDir, { recursive: true })
  writeFileSync(path.join(webDir, "package.json"), JSON.stringify({ name }))
  if (configFile)
    writeFileSync(path.join(webDir, configFile), "export default {}\n")
  for (const [relPath, content] of Object.entries(extraFiles)) {
    const full = path.join(webDir, relPath)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return webDir
}

test("parseWebStack defaults to vite when --web-stack is absent", () => {
  assert.equal(parseWebStack([]), "vite")
  assert.equal(parseWebStack(["audit"]), "vite")
})

test("parseWebStack accepts explicit vite and next values", () => {
  assert.equal(parseWebStack(["--web-stack", "vite"]), "vite")
  assert.equal(parseWebStack(["--web-stack", "next"]), "next")
})

test("parseWebStack rejects any other value with a pt-BR message", () => {
  assert.throws(
    () => parseWebStack(["--web-stack", "svelte"]),
    (err) =>
      err instanceof InvalidWebStackError &&
      err.value === "svelte" &&
      /vite.*next|next.*vite/.test(err.message)
  )
})

test("assertWebShell is a no-op when apps/web does not exist (unrendered fixture)", () => {
  const childDir = tmpChild()
  try {
    assert.doesNotThrow(() => assertWebShell(childDir, "next"))
  } finally {
    rmSync(childDir, { recursive: true, force: true })
  }
})

test("assertWebShell accepts a well-formed vite child (happy path)", () => {
  const childDir = tmpChild()
  try {
    writeWebShell(childDir, {
      configFile: "vite.config.ts",
      extraFiles: { "src/main.tsx": 'from "react"\n' },
    })
    assert.doesNotThrow(() => assertWebShell(childDir, "vite"))
  } finally {
    rmSync(childDir, { recursive: true, force: true })
  }
})

test("assertWebShell accepts a well-formed next child (happy path)", () => {
  const childDir = tmpChild()
  try {
    writeWebShell(childDir, {
      configFile: "next.config.ts",
      extraFiles: { "app/page.tsx": "export default function Page() {}\n" },
    })
    assert.doesNotThrow(() => assertWebShell(childDir, "next"))
  } finally {
    rmSync(childDir, { recursive: true, force: true })
  }
})

test("assertWebShell rejects a shape mismatch (vite.config.ts present when --web-stack next was requested)", () => {
  const childDir = tmpChild()
  try {
    writeWebShell(childDir, { configFile: "vite.config.ts" })
    assert.throws(
      () => assertWebShell(childDir, "next"),
      (err) =>
        err instanceof WebShellMismatchError &&
        /formato esperado/.test(err.message)
    )
  } finally {
    rmSync(childDir, { recursive: true, force: true })
  }
})

test("assertWebShell rejects a package.json name other than web even with the right config file", () => {
  const childDir = tmpChild()
  try {
    writeWebShell(childDir, { name: "web-app", configFile: "next.config.ts" })
    assert.throws(
      () => assertWebShell(childDir, "next"),
      (err) => err instanceof WebShellMismatchError
    )
  } finally {
    rmSync(childDir, { recursive: true, force: true })
  }
})

test("assertWebShell rejects a Next child that still references VITE_/@tanstack/react-router/nginx (ACC-06)", () => {
  const childDir = tmpChild()
  try {
    writeWebShell(childDir, {
      configFile: "next.config.ts",
      extraFiles: { "src/env.ts": "const url = process.env.VITE_API_URL;\n" },
    })
    assert.throws(
      () => assertWebShell(childDir, "next"),
      (err) =>
        err instanceof WebShellMismatchError && err.message.includes("VITE_")
    )
  } finally {
    rmSync(childDir, { recursive: true, force: true })
  }
})

test("assertWebShell rejects a Vite child that imports from next (ACC-06)", () => {
  const childDir = tmpChild()
  try {
    writeWebShell(childDir, {
      configFile: "vite.config.ts",
      extraFiles: { "src/layout.tsx": 'import { Link } from "next/link";\n' },
    })
    assert.throws(
      () => assertWebShell(childDir, "vite"),
      (err) =>
        err instanceof WebShellMismatchError &&
        err.message.includes('from "next')
    )
  } finally {
    rmSync(childDir, { recursive: true, force: true })
  }
})
