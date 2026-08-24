import { existsSync } from "node:fs"
import path from "node:path"
import { readManifest } from "./manifest.mjs"
import { discoverEntries } from "./entries.mjs"

export class UnknownEntryError extends Error {
  constructor(name) {
    super(`entrada de catálogo desconhecida: ${name}`)
    this.name = "UnknownEntryError"
    this.entry = name
  }
}

export class CatalogRootMissingError extends Error {
  constructor(catalogRoot) {
    super(`catalogRoot não encontrado: ${catalogRoot}`)
    this.name = "CatalogRootMissingError"
    this.catalogRoot = catalogRoot
  }
}

export class CyclicDependencyError extends Error {
  constructor(chain) {
    super(`ciclo de dependências detectado: ${chain.join(" -> ")}`)
    this.name = "CyclicDependencyError"
    this.chain = chain
  }
}

export function entryRootFor(catalogRoot, name, variant) {
  return variant
    ? path.join(catalogRoot, name, variant)
    : path.join(catalogRoot, name)
}

function indexEntries(catalogRoot) {
  if (!existsSync(catalogRoot)) {
    throw new CatalogRootMissingError(catalogRoot)
  }
  const index = new Map()
  for (const dir of discoverEntries(catalogRoot)) {
    const manifest = readManifest(path.join(dir, "module.json"))
    if (!index.has(manifest.name)) {
      index.set(manifest.name, { name: manifest.name, dir, manifest })
    }
  }
  return index
}

export function listEntries(catalogRoot) {
  return [...indexEntries(catalogRoot).values()]
}

export function findEntry(catalogRoot, name) {
  const entry = indexEntries(catalogRoot).get(name)
  if (!entry) throw new UnknownEntryError(name)
  return entry
}

export function resolveInstallOrder({
  catalogRoot,
  requested = [],
  isSatisfied = () => false,
}) {
  const index = indexEntries(catalogRoot)
  const order = []
  const visiting = new Set()
  const visited = new Set()

  function visit(name, chain) {
    if (visited.has(name)) return
    if (visiting.has(name)) {
      throw new CyclicDependencyError([...chain, name])
    }
    const entry = index.get(name)
    if (!entry) throw new UnknownEntryError(name)
    visiting.add(name)
    for (const dep of entry.manifest.dependsOn ?? []) {
      if (!isSatisfied(dep)) visit(dep.name, [...chain, name])
    }
    visiting.delete(name)
    visited.add(name)
    order.push(entry)
  }

  const roots = requested.length > 0 ? requested : [...index.keys()]
  for (const name of roots) visit(name, [])

  return order
}
