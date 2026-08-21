import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import { readManifest } from "./manifest.mjs";

export class AlreadyInstalledError extends Error {
  constructor(name, version) {
    super(`already installed ${name}@${version}`);
    this.name = "AlreadyInstalledError";
  }
}

export class KernelRangeError extends Error {
  constructor(requiredRange, templateVersion) {
    super(`kernelRange não satisfeito: exige ${requiredRange}, template está em ${templateVersion}`);
    this.name = "KernelRangeError";
    this.requiredRange = requiredRange;
    this.templateVersion = templateVersion;
  }
}

export class MissingDepsError extends Error {
  constructor(missing) {
    super(`dependências ausentes: ${missing.map((dep) => `${dep.name}@${dep.range}`).join(", ")}`);
    this.name = "MissingDepsError";
    this.missing = missing;
  }
}

export class CyclicDependencyError extends Error {
  constructor(chain) {
    super(`ciclo de dependências detectado: ${chain.join(" -> ")}`);
    this.name = "CyclicDependencyError";
    this.chain = chain;
  }
}

export function checkKernelRange(manifest, templateVersion) {
  if (!semver.satisfies(templateVersion, manifest.kernelRange)) {
    throw new KernelRangeError(manifest.kernelRange, templateVersion);
  }
}

export function checkLock(lock, moduleName) {
  const entry = lock.modules?.[moduleName];
  if (entry) {
    throw new AlreadyInstalledError(moduleName, entry.version);
  }
}

function isSatisfiedByLock(lock, dep) {
  const entry = lock.modules?.[dep.name];
  return Boolean(entry) && semver.satisfies(entry.version, dep.range);
}

function loadDepManifest(catalogRoot, name) {
  return readManifest(path.join(catalogRoot, name, "module.json"));
}

export function resolveDeps({ catalogRoot, manifest, lock, withDeps = false }) {
  const missing = (manifest.dependsOn ?? []).filter((dep) => !isSatisfiedByLock(lock, dep));

  if (missing.length === 0) {
    return { order: [manifest.name], missing: [] };
  }

  if (!withDeps) {
    throw new MissingDepsError(missing);
  }

  const order = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(name, chain) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new CyclicDependencyError([...chain, name]);
    }
    visiting.add(name);
    const depManifest = name === manifest.name ? manifest : loadDepManifest(catalogRoot, name);
    for (const dep of depManifest.dependsOn ?? []) {
      if (!isSatisfiedByLock(lock, dep)) {
        visit(dep.name, [...chain, name]);
      }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  visit(manifest.name, []);

  return { order, missing: [] };
}

function listFilesRecursive(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full).map((rel) => path.join(entry.name, rel)));
    } else {
      results.push(entry.name);
    }
  }
  return results;
}

export function planCopy(catalogEntryRoot, manifest, { webRoot, targetRoot = "" } = {}) {
  const files = [];

  const apiDir = path.join(catalogEntryRoot, "api");
  if (existsSync(apiDir)) {
    for (const rel of listFilesRecursive(apiDir)) {
      files.push({
        from: path.join(apiDir, rel),
        to: path.join(targetRoot, "apps/api/src/modules", manifest.name, rel),
      });
    }
  }

  for (const part of ["core", "react"]) {
    const dir = path.join(catalogEntryRoot, "web", part);
    if (existsSync(dir)) {
      const root = webRoot ?? manifest.web?.defaultRoot;
      for (const rel of listFilesRecursive(dir)) {
        files.push({ from: path.join(dir, rel), to: path.join(targetRoot, root, part, rel) });
      }
    }
  }

  const parityDir = path.join(catalogEntryRoot, "parity");
  if (existsSync(parityDir)) {
    for (const rel of listFilesRecursive(parityDir)) {
      if (rel.endsWith(".parity.spec.ts") || rel === "contract.snapshot.json") {
        files.push({
          from: path.join(parityDir, rel),
          to: path.join(targetRoot, "apps/api/src/modules", manifest.name, "__parity__", rel),
        });
      }
    }
  }

  const conflicts = files.filter((file) => existsSync(file.to)).map((file) => file.to);

  return { files, conflicts };
}
