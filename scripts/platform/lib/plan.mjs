import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import semver from "semver"
import { CyclicDependencyError, resolveInstallOrder } from "./catalog-graph.mjs"
import { childLayout } from "./child-layout.mjs"

export { CyclicDependencyError }

export class AlreadyInstalledError extends Error {
  constructor(name, version) {
    super(`already installed ${name}@${version}`)
    this.name = "AlreadyInstalledError"
  }
}

export class KernelRangeError extends Error {
  constructor(requiredRange, templateVersion) {
    super(
      `kernelRange não satisfeito: exige ${requiredRange}, template está em ${templateVersion}`
    )
    this.name = "KernelRangeError"
    this.requiredRange = requiredRange
    this.templateVersion = templateVersion
  }
}

export class MissingDepsError extends Error {
  constructor(missing) {
    super(
      `dependências ausentes: ${missing.map((dep) => `${dep.name}@${dep.range}`).join(", ")}`
    )
    this.name = "MissingDepsError"
    this.missing = missing
  }
}

export function checkKernelRange(manifest, templateVersion) {
  if (!semver.satisfies(templateVersion, manifest.kernelRange)) {
    throw new KernelRangeError(manifest.kernelRange, templateVersion)
  }
}

export function checkLock(lock, moduleName) {
  const entry = lock.modules?.[moduleName]
  if (entry) {
    throw new AlreadyInstalledError(moduleName, entry.version)
  }
}

function isSatisfiedByLock(lock, dep) {
  const entry = lock.modules?.[dep.name]
  return Boolean(entry) && semver.satisfies(entry.version, dep.range)
}

export function resolveDeps({ catalogRoot, manifest, lock, withDeps = false }) {
  const missing = (manifest.dependsOn ?? []).filter(
    (dep) => !isSatisfiedByLock(lock, dep)
  )

  if (missing.length === 0) {
    return { order: [manifest.name], missing: [] }
  }

  if (!withDeps) {
    throw new MissingDepsError(missing)
  }

  const order = resolveInstallOrder({
    catalogRoot,
    requested: [manifest.name],
    isSatisfied: (dep) => isSatisfiedByLock(lock, dep),
  }).map((entry) => entry.name)

  return { order, missing: [] }
}

function listFilesRecursive(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(
        ...listFilesRecursive(full).map((rel) => path.join(entry.name, rel))
      )
    } else {
      results.push(entry.name)
    }
  }
  return results
}

export function planCopy(
  catalogEntryRoot,
  manifest,
  { webRoot, targetRoot = "" } = {}
) {
  const layout = childLayout(targetRoot)
  const files = []

  const apiDir = path.join(catalogEntryRoot, "api")
  if (existsSync(apiDir)) {
    for (const rel of listFilesRecursive(apiDir)) {
      files.push({
        from: path.join(apiDir, rel),
        to: path.join(layout.moduleDir(manifest.name), rel),
      })
    }
  }

  for (const part of ["core", "react"]) {
    const dir = path.join(catalogEntryRoot, "web", part)
    if (existsSync(dir)) {
      const root = webRoot ?? manifest.web?.defaultRoot
      for (const rel of listFilesRecursive(dir)) {
        files.push({
          from: path.join(dir, rel),
          to: path.join(targetRoot, root, part, rel),
        })
      }
    }
  }

  const parityDir = path.join(catalogEntryRoot, "parity")
  if (existsSync(parityDir)) {
    for (const rel of listFilesRecursive(parityDir)) {
      if (rel.endsWith(".parity.spec.ts") || rel === "contract.snapshot.json") {
        files.push({
          from: path.join(parityDir, rel),
          to: path.join(layout.parityDir(manifest.name), rel),
        })
      }
    }
  }

  const conflicts = files
    .filter((file) => existsSync(file.to))
    .map((file) => file.to)

  return { files, conflicts }
}
