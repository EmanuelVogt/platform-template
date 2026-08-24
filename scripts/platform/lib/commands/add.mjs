import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import {
  copyFiles,
  removeTemplateOnlyFiles,
  rollback as applyRollback,
  writeEnv,
  writeLock as persistEntry,
  writeRegistry,
} from "../apply.mjs"
import { entryRootFor, findEntry } from "../catalog-graph.mjs"
import { resolveCatalog } from "../catalog-source.mjs"
import { childLayout, webRootFor } from "../child-layout.mjs"
import { EXIT_CODES } from "../exit-codes.mjs"
import { readLock } from "../lock.mjs"
import { readManifest } from "../manifest.mjs"
import { MigrationFailureError, generateForModule } from "../migrations.mjs"
import {
  AlreadyInstalledError,
  CyclicDependencyError,
  KernelRangeError,
  MissingDepsError,
  checkKernelRange,
  checkLock,
  planCopy,
  resolveDeps,
} from "../plan.mjs"
import { parseInstalledVersion } from "../template-version.mjs"

function defaultRun(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

export function readTemplateVersion(cwd) {
  const answersPath = childLayout(cwd).copierAnswersPath
  if (!existsSync(answersPath)) return undefined
  const answers = parseYaml(readFileSync(answersPath, "utf8")) ?? {}
  const parsed = parseInstalledVersion(answers._commit)
  return parsed ? parsed.version.replace(/^v/, "") : undefined
}

function registryEntry(manifest) {
  return {
    name: manifest.name,
    apiModule: manifest.apiModule,
    schemaExports: manifest.schemaExports,
  }
}

function buildRegistryEntries(catalogRoot, lockModules, known, excludeName) {
  const entries = []
  for (const [moduleName, lockEntry] of Object.entries(lockModules ?? {})) {
    if (moduleName === excludeName) continue
    const manifest =
      known.get(moduleName) ??
      readManifest(
        path.join(
          entryRootFor(catalogRoot, moduleName, lockEntry.variant),
          "module.json"
        )
      )
    entries.push(registryEntry(manifest))
  }
  return entries
}

function runRollback({
  name,
  options,
  cwd,
  lockPath,
  envExamplePath,
  envPath,
  platformModulesPath,
  platformSchemaPath,
}) {
  const lock = readLock(lockPath)
  const entry = lock.modules?.[name]
  if (!entry) {
    process.stdout.write(`nada para reverter: ${name} não está no lock\n`)
    return EXIT_CODES.OK
  }

  let entries
  try {
    const catalog = resolveCatalog(options["catalog-ref"], {
      copierAnswersPath: childLayout(cwd).copierAnswersPath,
    })
    entries = buildRegistryEntries(catalog.root, lock.modules, new Map(), name)
  } catch (err) {
    process.stderr.write(
      `catálogo inacessível — revert abortado, registro preservado: ${err.message}\n`
    )
    return EXIT_CODES.CATALOG_UNREACHABLE
  }

  for (const fileName of entry.migrations ?? []) {
    const migrationPath = path.join(childLayout(cwd).migrationsDir, fileName)
    if (existsSync(migrationPath)) rmSync(migrationPath)
  }

  applyRollback({
    lockPath,
    name,
    envExamplePath,
    envPath,
    registry: { entries, platformModulesPath, platformSchemaPath },
    childRoot: cwd,
  })
  process.stdout.write(`${name} revertido\n`)
  return EXIT_CODES.OK
}

export async function addCommand({
  name,
  options,
  cwd = process.cwd(),
  run = defaultRun,
}) {
  const {
    lockPath,
    envExamplePath,
    envPath,
    platformModulesPath,
    platformSchemaPath,
    copierAnswersPath,
  } = childLayout(cwd)

  if (options.rollback) {
    return runRollback({
      name,
      options,
      cwd,
      lockPath,
      envExamplePath,
      envPath,
      platformModulesPath,
      platformSchemaPath,
    })
  }

  let catalog
  let manifest
  try {
    catalog = resolveCatalog(options["catalog-ref"], { copierAnswersPath })
    manifest = readManifest(
      path.join(
        entryRootFor(catalog.root, name, options.variant),
        "module.json"
      )
    )
  } catch (err) {
    process.stderr.write(
      `catálogo inacessível ou módulo ausente: ${err.message}\n`
    )
    return EXIT_CODES.CATALOG_UNREACHABLE
  }

  const templateVersion = readTemplateVersion(cwd)
  try {
    checkKernelRange(manifest, templateVersion)
  } catch (err) {
    if (!(err instanceof KernelRangeError)) throw err
    process.stderr.write(`${err.message}\n`)
    return EXIT_CODES.KERNEL_RANGE_UNSATISFIED
  }

  let lock = readLock(lockPath)
  try {
    checkLock(lock, name)
  } catch (err) {
    if (!(err instanceof AlreadyInstalledError)) throw err
    process.stderr.write(`${err.message}\n`)
    return EXIT_CODES.ALREADY_INSTALLED
  }

  let order
  try {
    ;({ order } = resolveDeps({
      catalogRoot: catalog.root,
      manifest,
      lock,
      withDeps: Boolean(options["with-deps"]),
    }))
  } catch (err) {
    if (err instanceof CyclicDependencyError) {
      process.stderr.write(`${err.message}\n`)
      return EXIT_CODES.MISSING_DEPS
    }
    if (!(err instanceof MissingDepsError)) throw err
    const missing = err.missing
      .map((dep) => `${dep.name}@${dep.range}`)
      .join(", ")
    process.stderr.write(
      `dependências ausentes (use --with-deps): ${missing}\n`
    )
    return EXIT_CODES.MISSING_DEPS
  }

  const noWebReact = Boolean(options["no-web-react"])
  const known = new Map([[name, manifest]])
  const plans = []
  for (const moduleName of order) {
    const isTarget = moduleName === name
    const entryRoot = isTarget
      ? entryRootFor(catalog.root, name, options.variant)
      : findEntry(catalog.root, moduleName).dir
    const moduleManifest = isTarget
      ? manifest
      : readManifest(path.join(entryRoot, "module.json"))
    if (!isTarget) known.set(moduleName, moduleManifest)

    const webRoot = webRootFor(moduleName, options["web-root"])
    let { files, conflicts } = planCopy(entryRoot, moduleManifest, {
      webRoot,
      targetRoot: cwd,
    })
    if (noWebReact) {
      const reactPrefix = path.join(cwd, webRoot, "react")
      files = files.filter((file) => !file.to.startsWith(reactPrefix))
      conflicts = conflicts.filter(
        (conflict) => !conflict.startsWith(reactPrefix)
      )
    }

    plans.push({
      moduleName,
      manifest: moduleManifest,
      entryRoot,
      files,
      conflicts,
      entryBase: {
        version: moduleManifest.version,
        variant: moduleManifest.variant,
        installedAt: new Date().toISOString(),
        catalogRef: catalog.ref,
        files: files.map((file) => file.to),
      },
    })
  }

  const allConflicts = plans.flatMap((plan) => plan.conflicts)
  if (allConflicts.length > 0 && !options.force) {
    process.stderr.write(
      `arquivos já existem (use --force): ${allConflicts.join(", ")}\n`
    )
    return EXIT_CODES.DESTINATION_EXISTS
  }

  if (options["dry-run"]) {
    for (const plan of plans) {
      process.stdout.write(`módulo ${plan.moduleName}\n`)
      for (const file of plan.files)
        process.stdout.write(`  copiar ${file.from} -> ${file.to}\n`)
      for (const migration of plan.manifest.customMigrations ?? []) {
        process.stdout.write(`  migração customizada: ${migration}\n`)
      }
      for (const envVar of plan.manifest.env ?? [])
        process.stdout.write(`  env: ${envVar.name}\n`)
      if (plan.manifest.apiModule)
        process.stdout.write(`  registro: ${plan.manifest.apiModule.export}\n`)
    }
    return EXIT_CODES.OK
  }

  try {
    for (const plan of plans) {
      copyFiles(plan.files)
      writeEnv({
        envExamplePath,
        envPath,
        moduleName: plan.moduleName,
        envVars: plan.manifest.env,
      })
      lock = persistEntry({
        lockPath,
        lock,
        name: plan.moduleName,
        entry: { ...plan.entryBase, migrations: [] },
        childRoot: cwd,
      })
    }

    for (const removed of removeTemplateOnlyFiles(cwd)) {
      process.stdout.write(`removido (valia só para o template): ${removed}\n`)
    }

    const registryEntries = buildRegistryEntries(
      catalog.root,
      lock.modules,
      known,
      undefined
    )
    writeRegistry({
      entries: registryEntries,
      platformModulesPath,
      platformSchemaPath,
    })

    for (const plan of plans) {
      const migrations = generateForModule(cwd, plan.manifest, {
        catalogEntryRoot: plan.entryRoot,
        run,
      })
      lock = persistEntry({
        lockPath,
        lock,
        name: plan.moduleName,
        entry: { ...plan.entryBase, migrations },
        childRoot: cwd,
      })
    }
  } catch (err) {
    if (!(err instanceof MigrationFailureError)) throw err
    process.stderr.write(`${err.message} — arquivos mantidos, use --rollback\n`)
    return EXIT_CODES.MIGRATION_FAILURE
  }

  const contractResult = run("pnpm", ["contract"], { cwd })
  if (contractResult.status !== 0) {
    process.stderr.write(
      `contrato falhou — arquivos mantidos, use --rollback\n`
    )
    return EXIT_CODES.TEST_FAILURE
  }

  if (!options["skip-tests"]) {
    const testResult = run(
      "pnpm",
      ["vitest", "run", "--project", "api", `apps/api/src/modules/${name}`],
      { cwd }
    )
    if (testResult.status !== 0) {
      process.stderr.write(
        `testes falharam — arquivos mantidos, use --rollback\n`
      )
      return EXIT_CODES.TEST_FAILURE
    }

    const targetPlan = plans.find((plan) => plan.moduleName === name)
    const targetWebRoot = path.join(cwd, webRootFor(name, options["web-root"]))
    const webCopied = targetPlan.files.some((file) =>
      file.to.startsWith(targetWebRoot)
    )
    if (webCopied) {
      const webResult = run(
        "pnpm",
        [
          "vitest",
          "run",
          "--project",
          "web",
          webRootFor(name, options["web-root"]),
        ],
        { cwd }
      )
      if (webResult.status !== 0) {
        process.stderr.write(
          `testes web falharam — arquivos mantidos, use --rollback\n`
        )
        return EXIT_CODES.TEST_FAILURE
      }
    }
  }

  process.stdout.write(`${name}@${manifest.version} instalado\n`)
  return EXIT_CODES.OK
}
