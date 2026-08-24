import test from "node:test"
import assert from "node:assert/strict"
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { EXIT_CODES } from "../lib/exit-codes.mjs"
import { CyclicDependencyError } from "../lib/plan.mjs"
import {
  CatalogRootMissingError,
  UnknownEntryError,
  resolveInstallOrder,
} from "../lib/catalog-graph.mjs"
import {
  parseEntries,
  parseKeep,
  parseKernelVersion,
  runCatalogCheck,
} from "../catalog-check.mjs"

function manifest({ name, variant, dependsOn }) {
  return {
    name,
    ...(variant ? { variant } : {}),
    version: "1.0.0",
    kernelRange: ">=1.0.0 <2.0.0",
    ...(dependsOn
      ? {
          dependsOn: dependsOn.map((dep) => ({
            name: dep,
            range: ">=1.0.0 <2.0.0",
          })),
        }
      : {}),
  }
}

function buildRealGraphCatalog(root) {
  writeEntry(root, "notification", manifest({ name: "notification" }))
  writeEntry(
    root,
    "identity",
    manifest({
      name: "identity",
      variant: "single-tenant",
      dependsOn: ["notification"],
    }),
    "single-tenant"
  )
  writeEntry(
    root,
    "audit",
    manifest({ name: "audit", dependsOn: ["identity"] })
  )
  writeEntry(
    root,
    "attachment",
    manifest({ name: "attachment", dependsOn: ["identity"] })
  )
  writeEntry(root, "tag", manifest({ name: "tag", dependsOn: ["identity"] }))
}

function writeEntry(root, name, manifestBody, variant) {
  const dir = variant ? path.join(root, name, variant) : path.join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, "module.json"), JSON.stringify(manifestBody))
}

function withTmpCatalog(build) {
  const root = mkdtempSync(path.join(tmpdir(), "catalog-check-fixture-"))
  try {
    build(root)
    return root
  } catch (err) {
    rmSync(root, { recursive: true, force: true })
    throw err
  }
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true })
}

function assertTopologicallyValid(order) {
  const indexOf = new Map(order.map((entry, index) => [entry.name, index]))
  for (const entry of order) {
    for (const dep of entry.manifest.dependsOn ?? []) {
      assert.ok(
        indexOf.get(dep.name) < indexOf.get(entry.name),
        `${dep.name} deveria vir antes de ${entry.name}`
      )
    }
  }
}

test("parseEntries keeps positionals and drops flags", () => {
  assert.deepEqual(parseEntries(["audit", "tag"]), ["audit", "tag"])
  assert.deepEqual(parseEntries(["--dry-run", "audit"]), ["audit"])
  assert.deepEqual(parseEntries([]), [])
})

test("resolveInstallOrder with no entries installs every entry in a valid topological order", () => {
  const root = withTmpCatalog(buildRealGraphCatalog)
  try {
    const order = resolveInstallOrder({ catalogRoot: root, requested: [] })
    assert.deepEqual(order.map((entry) => entry.name).sort(), [
      "attachment",
      "audit",
      "identity",
      "notification",
      "tag",
    ])
    assertTopologicallyValid(order)
  } finally {
    cleanup(root)
  }
})

test("resolveInstallOrder(['audit']) brings notification and identity first, in that order", () => {
  const root = withTmpCatalog(buildRealGraphCatalog)
  try {
    const order = resolveInstallOrder({
      catalogRoot: root,
      requested: ["audit"],
    })
    assert.deepEqual(
      order.map((entry) => entry.name),
      ["notification", "identity", "audit"]
    )
    assert.equal(order[1].manifest.variant, "single-tenant")
  } finally {
    cleanup(root)
  }
})

test("resolveInstallOrder(['tag', 'audit']) dedupes the shared notification/identity chain", () => {
  const root = withTmpCatalog(buildRealGraphCatalog)
  try {
    const order = resolveInstallOrder({
      catalogRoot: root,
      requested: ["tag", "audit"],
    })
    const names = order.map((entry) => entry.name)
    assert.deepEqual(
      [...new Set(names)],
      names,
      "cada entrada aparece uma única vez"
    )
    assert.deepEqual(names.slice(0, 2), ["notification", "identity"])
    assert.deepEqual(
      new Set(names),
      new Set(["notification", "identity", "audit", "tag"])
    )
  } finally {
    cleanup(root)
  }
})

test("resolveInstallOrder rejects an unknown entry name", () => {
  const root = withTmpCatalog(buildRealGraphCatalog)
  try {
    assert.throws(
      () => resolveInstallOrder({ catalogRoot: root, requested: ["bogus"] }),
      (err) => err instanceof UnknownEntryError && err.entry === "bogus"
    )
  } finally {
    cleanup(root)
  }
})

test("resolveInstallOrder reports the exact cycle chain", () => {
  const root = withTmpCatalog((dir) => {
    writeEntry(dir, "cyc-a", manifest({ name: "cyc-a", dependsOn: ["cyc-b"] }))
    writeEntry(dir, "cyc-b", manifest({ name: "cyc-b", dependsOn: ["cyc-a"] }))
  })
  try {
    assert.throws(
      () => resolveInstallOrder({ catalogRoot: root, requested: ["cyc-a"] }),
      (err) =>
        err instanceof CyclicDependencyError &&
        err.chain.join(" -> ") === "cyc-a -> cyc-b -> cyc-a"
    )
  } finally {
    cleanup(root)
  }
})

test("resolveInstallOrder rejects a missing catalogRoot", () => {
  const missing = path.join(tmpdir(), "catalog-check-does-not-exist")
  assert.throws(
    () => resolveInstallOrder({ catalogRoot: missing, requested: [] }),
    (err) =>
      err instanceof CatalogRootMissingError && err.catalogRoot === missing
  )
})

function stubRun(overrides = {}) {
  const calls = []
  const fn = (command, args = [], options = {}) => {
    calls.push({ command, args, options })
    const key = [command, ...args].join(" ")
    const match = Object.entries(overrides).find(([pattern]) =>
      key.startsWith(pattern)
    )
    return match ? match[1] : { status: 0, stdout: "", stderr: "" }
  }
  fn.calls = calls
  return fn
}

function stubRunCli(overrides = {}) {
  const calls = []
  const fn = async (args, deps) => {
    calls.push({ args, deps })
    const key = args.join(" ")
    const match = Object.entries(overrides).find(([pattern]) =>
      key.includes(pattern)
    )
    return match ? match[1] : EXIT_CODES.OK
  }
  fn.calls = calls
  return fn
}

test("runCatalogCheck happy path renders, installs, adds every entry in order (with variant) and runs the final gate", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun()
  const runCli = stubRunCli()
  const logs = []
  try {
    const code = await runCatalogCheck({
      entries: [],
      repoRoot: "/repo",
      catalogRoot,
      scratchDir: "/scratch/child",
      run,
      runCli,
      log: (line) => logs.push(line),
    })

    assert.equal(code, EXIT_CODES.OK)
    assert.ok(
      logs.some((line) =>
        line.includes("pnpm check && pnpm test && pnpm test:db")
      )
    )
    const callArgs = runCli.calls.map((call) => call.args)
    assert.deepEqual(callArgs.slice(0, 2), [
      ["module", "add", "notification", "--catalog-ref", catalogRoot],
      [
        "module",
        "add",
        "identity",
        "--catalog-ref",
        catalogRoot,
        "--variant",
        "single-tenant",
      ],
    ])
    assert.deepEqual(
      new Set(callArgs.slice(2).map((args) => args[2])),
      new Set(["audit", "attachment", "tag"]),
      "audit/attachment/tag têm ordem livre entre si, mas todos devem rodar depois de identity"
    )
    assert.ok(runCli.calls.every((call) => call.deps.cwd === "/scratch/child"))

    const commands = run.calls.map((call) =>
      [call.command, ...call.args].join(" ")
    )
    assert.equal(
      commands[0],
      "copier copy --trust --defaults --vcs-ref HEAD --data project_name=Demo --data github_org=acme --data root_domain=demo.test /repo /scratch/child"
    )
    assert.equal(commands[1], "pnpm install")
    assert.deepEqual(commands.slice(-3), [
      "pnpm check",
      "pnpm test",
      "pnpm test:db",
    ])
  } finally {
    cleanup(catalogRoot)
  }
})

test("runCatalogCheck gives the child's pnpm contract step placeholder DATABASE_URL/REDIS_URL/WEB_ORIGIN/R2_*, without touching other commands", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun()
  const runCli = stubRunCli()
  const envKeys = [
    "DATABASE_URL",
    "REDIS_URL",
    "WEB_ORIGIN",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_ENDPOINT",
  ]
  const savedEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]])
  )
  for (const key of envKeys) delete process.env[key]
  try {
    await runCatalogCheck({
      entries: ["notification"],
      repoRoot: "/repo",
      catalogRoot,
      scratchDir: "/scratch/child",
      run,
      runCli,
      log: () => {},
    })

    const wrappedRun = runCli.calls[0].deps.run
    wrappedRun("pnpm", ["contract"], { cwd: "/scratch/child" })
    const contractCall = run.calls.find(
      (call) => call.command === "pnpm" && call.args[0] === "contract"
    )
    assert.ok(
      contractCall,
      "wrapped run deve repassar a chamada real para pnpm contract"
    )
    assert.equal(contractCall.options.cwd, "/scratch/child")
    assert.equal(
      contractCall.options.env.DATABASE_URL,
      "postgresql://placeholder:placeholder@localhost:5432/placeholder"
    )
    assert.equal(contractCall.options.env.REDIS_URL, "redis://localhost:6379")
    assert.equal(contractCall.options.env.WEB_ORIGIN, "http://localhost:3000")
    assert.equal(contractCall.options.env.R2_ACCOUNT_ID, "placeholder")
    assert.equal(contractCall.options.env.R2_ACCESS_KEY_ID, "placeholder")
    assert.equal(contractCall.options.env.R2_SECRET_ACCESS_KEY, "placeholder")
    assert.equal(contractCall.options.env.R2_BUCKET, "placeholder")
    assert.equal(
      contractCall.options.env.R2_ENDPOINT,
      "https://placeholder.r2.example.com"
    )

    wrappedRun("pnpm", ["check"], { cwd: "/scratch/child" })
    const otherCall = run.calls.find(
      (call) => call.command === "pnpm" && call.args[0] === "check"
    )
    assert.equal(
      otherCall.options.env,
      undefined,
      "comandos fora do passo contract não recebem env injetado"
    )
  } finally {
    cleanup(catalogRoot)
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("runCatalogCheck fails fast on an unknown entry without rendering anything", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun()
  const runCli = stubRunCli()
  try {
    const code = await runCatalogCheck({
      entries: ["bogus"],
      catalogRoot,
      run,
      runCli,
      log: () => {},
    })
    assert.equal(code, EXIT_CODES.USAGE_ERROR)
    assert.equal(run.calls.length, 0)
    assert.equal(runCli.calls.length, 0)
  } finally {
    cleanup(catalogRoot)
  }
})

test("runCatalogCheck surfaces a cycle as MISSING_DEPS before touching disk", async () => {
  const catalogRoot = withTmpCatalog((dir) => {
    writeEntry(dir, "cyc-a", manifest({ name: "cyc-a", dependsOn: ["cyc-b"] }))
    writeEntry(dir, "cyc-b", manifest({ name: "cyc-b", dependsOn: ["cyc-a"] }))
  })
  const run = stubRun()
  const logs = []
  try {
    const code = await runCatalogCheck({
      entries: ["cyc-a"],
      catalogRoot,
      run,
      runCli: stubRunCli(),
      log: (line) => logs.push(line),
    })
    assert.equal(code, EXIT_CODES.MISSING_DEPS)
    assert.equal(run.calls.length, 0)
    assert.ok(logs.some((line) => line.includes("cyc-a -> cyc-b -> cyc-a")))
  } finally {
    cleanup(catalogRoot)
  }
})

test("runCatalogCheck maps a missing catalogRoot to CATALOG_UNREACHABLE", async () => {
  const code = await runCatalogCheck({
    entries: [],
    catalogRoot: path.join(tmpdir(), "catalog-check-does-not-exist-2"),
    run: stubRun(),
    runCli: stubRunCli(),
    log: () => {},
  })
  assert.equal(code, EXIT_CODES.CATALOG_UNREACHABLE)
})

test("runCatalogCheck maps a render (copier) failure to CATALOG_UNREACHABLE and never installs", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun({ copier: { status: 1, stdout: "", stderr: "boom" } })
  const runCli = stubRunCli()
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      catalogRoot,
      run,
      runCli,
      log: () => {},
    })
    assert.equal(code, EXIT_CODES.CATALOG_UNREACHABLE)
    assert.ok(run.calls.every((call) => call.command !== "pnpm"))
    assert.equal(runCli.calls.length, 0)
  } finally {
    cleanup(catalogRoot)
  }
})

test("runCatalogCheck maps a pnpm install failure to CATALOG_UNREACHABLE and never calls module add", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun({
    "pnpm install": { status: 1, stdout: "", stderr: "boom" },
  })
  const runCli = stubRunCli()
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      catalogRoot,
      run,
      runCli,
      log: () => {},
    })
    assert.equal(code, EXIT_CODES.CATALOG_UNREACHABLE)
    assert.equal(runCli.calls.length, 0)
  } finally {
    cleanup(catalogRoot)
  }
})

test("runCatalogCheck attributes a failing entry, propagates its exit code and stops before the next entry", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun()
  const runCli = stubRunCli({ "add audit": EXIT_CODES.TEST_FAILURE })
  const logs = []
  try {
    const code = await runCatalogCheck({
      entries: ["audit"],
      catalogRoot,
      run,
      runCli,
      log: (line) => logs.push(line),
    })
    assert.equal(code, EXIT_CODES.TEST_FAILURE)
    assert.deepEqual(
      runCli.calls.map((call) => call.args),
      [
        ["module", "add", "notification", "--catalog-ref", catalogRoot],
        [
          "module",
          "add",
          "identity",
          "--catalog-ref",
          catalogRoot,
          "--variant",
          "single-tenant",
        ],
        ["module", "add", "audit", "--catalog-ref", catalogRoot],
      ]
    )
    assert.ok(
      logs.some((line) => line.includes('"audit"') && line.includes("7"))
    )
  } finally {
    cleanup(catalogRoot)
  }
})

test("parseKernelVersion extracts the --kernel-version value and leaves entries alone", () => {
  assert.equal(
    parseKernelVersion(["--kernel-version", "1.0.0", "audit"]),
    "1.0.0"
  )
  assert.equal(parseKernelVersion(["audit"]), undefined)
})

function stubRunWithFakeCopier(overrides = {}) {
  const calls = []
  const fn = (command, args = [], options = {}) => {
    calls.push({ command, args, options })
    if (command === "copier") {
      const targetDir = args.at(-1)
      writeFileSync(
        path.join(targetDir, ".copier-answers.yml"),
        "_src_path: .\n_commit: 0.2.0-90-g450f277\nproject_name: Demo\n"
      )
    }
    const key = [command, ...args].join(" ")
    const match = Object.entries(overrides).find(([pattern]) =>
      key.startsWith(pattern)
    )
    return match ? match[1] : { status: 0, stdout: "", stderr: "" }
  }
  fn.calls = calls
  return fn
}

test("runCatalogCheck simulates the pre-tag kernel version from the changelog by default", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const repoRoot = mkdtempSync(path.join(tmpdir(), "catalog-check-repo-"))
  const scratchDir = mkdtempSync(path.join(tmpdir(), "catalog-check-scratch-"))
  mkdirSync(path.join(repoRoot, "docs", "dev"), { recursive: true })
  writeFileSync(
    path.join(repoRoot, "docs", "dev", "template-changelog.md"),
    "# Changelog\n\n## v1.0.0\n\ntexto\n"
  )
  const run = stubRunWithFakeCopier()
  const logs = []
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      repoRoot,
      catalogRoot,
      scratchDir,
      run,
      runCli: stubRunCli(),
      log: (line) => logs.push(line),
    })
    assert.equal(code, EXIT_CODES.OK)
    const answers = parseYaml(
      readFileSync(path.join(scratchDir, ".copier-answers.yml"), "utf8")
    )
    assert.equal(answers._commit, "v1.0.0")
    assert.equal(
      answers.project_name,
      "Demo",
      "outras respostas do copier seguem intactas"
    )
    assert.ok(
      logs.some(
        (line) =>
          line.includes("simulando o kernel na versão 1.0.0") &&
          line.includes("ainda não")
      ),
      "precisa anunciar em pt-BR que a versão simulada não está tagueada de verdade"
    )
    assert.ok(
      run.calls.every(
        (call) => !(call.command === "git" && call.args.includes("tag"))
      ),
      "o gate nunca deve criar tag alguma, nem no repositório real nem em clone algum"
    )
  } finally {
    cleanup(catalogRoot)
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(scratchDir, { recursive: true, force: true })
  }
})

test("runCatalogCheck honors an explicit kernelVersion override instead of the changelog", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const scratchDir = mkdtempSync(path.join(tmpdir(), "catalog-check-scratch-"))
  const run = stubRunWithFakeCopier()
  const logs = []
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      repoRoot: "/repo-sem-changelog-real",
      catalogRoot,
      scratchDir,
      kernelVersion: "9.9.9",
      run,
      runCli: stubRunCli(),
      log: (line) => logs.push(line),
    })
    assert.equal(code, EXIT_CODES.OK)
    const answers = parseYaml(
      readFileSync(path.join(scratchDir, ".copier-answers.yml"), "utf8")
    )
    assert.equal(answers._commit, "v9.9.9")
    assert.ok(
      logs.some((line) => line.includes("simulando o kernel na versão 9.9.9"))
    )
  } finally {
    cleanup(catalogRoot)
    rmSync(scratchDir, { recursive: true, force: true })
  }
})

test("runCatalogCheck maps a final 'pnpm check' failure to TEST_FAILURE and never runs 'pnpm test'", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun({
    "pnpm check": { status: 1, stdout: "", stderr: "boom" },
  })
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      catalogRoot,
      run,
      runCli: stubRunCli(),
      log: () => {},
    })
    assert.equal(code, EXIT_CODES.TEST_FAILURE)
    assert.ok(
      run.calls.every((call) => ![...(call.args ?? [])].includes("test"))
    )
  } finally {
    cleanup(catalogRoot)
  }
})

test("runCatalogCheck maps a final 'pnpm test' failure to TEST_FAILURE and never runs 'pnpm test:db'", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun({
    "pnpm test": { status: 1, stdout: "", stderr: "boom" },
  })
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      catalogRoot,
      run,
      runCli: stubRunCli(),
      log: () => {},
    })
    assert.equal(code, EXIT_CODES.TEST_FAILURE)
    assert.ok(
      run.calls.every((call) => ![...(call.args ?? [])].includes("test:db"))
    )
  } finally {
    cleanup(catalogRoot)
  }
})

test("runCatalogCheck maps a final 'pnpm test:db' failure to TEST_FAILURE", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun({
    "pnpm test:db": { status: 1, stdout: "", stderr: "boom" },
  })
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      catalogRoot,
      run,
      runCli: stubRunCli(),
      log: () => {},
    })
    assert.equal(code, EXIT_CODES.TEST_FAILURE)
  } finally {
    cleanup(catalogRoot)
  }
})

test("parseKeep detects the --keep flag anywhere in argv", () => {
  assert.equal(parseKeep(["--keep", "audit"]), true)
  assert.equal(parseKeep(["audit", "--keep"]), true)
  assert.equal(parseKeep(["audit"]), false)
})

test("runCatalogCheck maps a render (copier) timeout to TEST_FAILURE and names the step", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun({
    copier: { status: null, stdout: "", stderr: "", timedOut: true },
  })
  const logs = []
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      catalogRoot,
      scratchDir: "/scratch/child",
      run,
      runCli: stubRunCli(),
      log: (line) => logs.push(line),
    })
    assert.equal(code, EXIT_CODES.TEST_FAILURE)
    assert.ok(
      logs.some(
        (line) =>
          line.includes('"render (copier)"') && line.includes("tempo limite")
      )
    )
  } finally {
    cleanup(catalogRoot)
  }
})

test("runCatalogCheck maps a final 'pnpm check' timeout to TEST_FAILURE and names the step", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun({
    "pnpm check": { status: null, stdout: "", stderr: "", timedOut: true },
  })
  const logs = []
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      catalogRoot,
      run,
      runCli: stubRunCli(),
      log: (line) => logs.push(line),
    })
    assert.equal(code, EXIT_CODES.TEST_FAILURE)
    assert.ok(
      logs.some(
        (line) => line.includes('"pnpm check"') && line.includes("tempo limite")
      )
    )
  } finally {
    cleanup(catalogRoot)
  }
})

function stubRunCliCallingContract(entryName) {
  const calls = []
  const fn = async (args, deps) => {
    calls.push({ args, deps })
    if (args[2] !== entryName) return EXIT_CODES.OK
    const result = deps.run("pnpm", ["contract"], { cwd: deps.cwd })
    return result.status === 0 ? EXIT_CODES.OK : EXIT_CODES.TEST_FAILURE
  }
  fn.calls = calls
  return fn
}

test("runCatalogCheck names the 'contract' sub-step and the failing entry when 'pnpm contract' hangs inside module add", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const run = stubRun({
    "pnpm contract": { status: null, stdout: "", stderr: "", timedOut: true },
  })
  const runCli = stubRunCliCallingContract("notification")
  const logs = []
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      catalogRoot,
      scratchDir: "/scratch/child",
      run,
      runCli,
      log: (line) => logs.push(line),
    })
    assert.equal(code, EXIT_CODES.TEST_FAILURE)
    assert.ok(
      logs.some(
        (line) =>
          line.includes('"contract"') &&
          line.includes("notification") &&
          line.includes("tempo limite")
      )
    )
  } finally {
    cleanup(catalogRoot)
  }
})

test("runCatalogCheck removes the scratch dir it created once the run finishes", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const repoRoot = mkdtempSync(path.join(tmpdir(), "catalog-check-repo-"))
  mkdirSync(path.join(repoRoot, "docs", "dev"), { recursive: true })
  writeFileSync(
    path.join(repoRoot, "docs", "dev", "template-changelog.md"),
    "# Changelog\n\n## v1.0.0\n\ntexto\n"
  )
  const run = stubRunWithFakeCopier()
  const logs = []
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      repoRoot,
      catalogRoot,
      run,
      runCli: stubRunCli(),
      log: (line) => logs.push(line),
    })
    assert.equal(code, EXIT_CODES.OK)
    const renderLog = logs.find((line) =>
      line.includes("renderizando child kernel-only em")
    )
    const childDir = renderLog.slice(renderLog.indexOf("em ") + 3)
    assert.ok(
      !existsSync(childDir),
      "diretório temporário próprio deve ser removido ao final"
    )
  } finally {
    cleanup(catalogRoot)
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test("runCatalogCheck keeps the scratch dir it created when keep:true is passed", async () => {
  const catalogRoot = withTmpCatalog(buildRealGraphCatalog)
  const repoRoot = mkdtempSync(path.join(tmpdir(), "catalog-check-repo-"))
  mkdirSync(path.join(repoRoot, "docs", "dev"), { recursive: true })
  writeFileSync(
    path.join(repoRoot, "docs", "dev", "template-changelog.md"),
    "# Changelog\n\n## v1.0.0\n\ntexto\n"
  )
  const run = stubRunWithFakeCopier()
  const logs = []
  let childDir
  try {
    const code = await runCatalogCheck({
      entries: ["notification"],
      repoRoot,
      catalogRoot,
      run,
      runCli: stubRunCli(),
      keep: true,
      log: (line) => logs.push(line),
    })
    assert.equal(code, EXIT_CODES.OK)
    const renderLog = logs.find((line) =>
      line.includes("renderizando child kernel-only em")
    )
    childDir = renderLog.slice(renderLog.indexOf("em ") + 3)
    assert.ok(
      existsSync(childDir),
      "com keep:true o diretório temporário deve sobreviver ao run"
    )
  } finally {
    cleanup(catalogRoot)
    rmSync(repoRoot, { recursive: true, force: true })
    if (childDir) rmSync(childDir, { recursive: true, force: true })
  }
})
