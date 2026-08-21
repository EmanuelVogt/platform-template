import { existsSync } from "node:fs";
import path from "node:path";
import { readManifest } from "./manifest.mjs";
import { discoverEntries } from "./lint.mjs";
import { CyclicDependencyError } from "./plan.mjs";

export class UnknownEntryError extends Error {
  constructor(name) {
    super(`entrada de catálogo desconhecida: ${name}`);
    this.name = "UnknownEntryError";
    this.entry = name;
  }
}

export class CatalogRootMissingError extends Error {
  constructor(catalogRoot) {
    super(`catalogRoot não encontrado: ${catalogRoot}`);
    this.name = "CatalogRootMissingError";
    this.catalogRoot = catalogRoot;
  }
}

function loadEntryByName(catalogRoot, name, cache) {
  if (cache.has(name)) return cache.get(name);
  for (const dir of discoverEntries(catalogRoot)) {
    const manifest = readManifest(path.join(dir, "module.json"));
    if (manifest.name === name) {
      const entry = { name, dir, manifest };
      cache.set(name, entry);
      return entry;
    }
  }
  throw new UnknownEntryError(name);
}

/**
 * Resolve a ordem topológica cumulativa de instalação para as entradas pedidas
 * (inclui `dependsOn` transitivo). Sem argumentos -> todas as entradas
 * encontradas em `catalogRoot`, em uma ordem topológica válida.
 */
export function resolveInstallOrder({ catalogRoot, requested = [] }) {
  if (!existsSync(catalogRoot)) {
    throw new CatalogRootMissingError(catalogRoot);
  }

  const cache = new Map();
  const order = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(name, chain) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new CyclicDependencyError([...chain, name]);
    }
    visiting.add(name);
    const entry = loadEntryByName(catalogRoot, name, cache);
    for (const dep of entry.manifest.dependsOn ?? []) {
      visit(dep.name, [...chain, name]);
    }
    visiting.delete(name);
    visited.add(name);
    order.push(entry);
  }

  const roots =
    requested.length > 0
      ? requested
      : discoverEntries(catalogRoot)
          .map((dir) => readManifest(path.join(dir, "module.json")).name)
          .filter((name, index, all) => all.indexOf(name) === index);

  for (const name of roots) visit(name, []);

  return order;
}
