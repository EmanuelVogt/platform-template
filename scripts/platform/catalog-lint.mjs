import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { isAdvisoryFilename } from "./lib/advisories.mjs";
import {
  discoverEntries,
  extractContractHeadings,
  lintAdvisoryFrontmatter,
  lintChangelogVersion,
  lintManifest,
  lintProductionTestingImports,
  lintReadmeHeadings,
  lintWebImports,
} from "./lib/lint.mjs";

function walkSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSourceFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function readWebLayer(entryDir, layer) {
  return walkSourceFiles(path.join(entryDir, "web", layer)).map((filePath) => ({
    path: filePath,
    content: readFileSync(filePath, "utf8"),
    layer,
  }));
}

function lintEntry(entryDir, contractHeadings) {
  const errors = [];
  const manifestPath = path.join(entryDir, "module.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return [`${manifestPath}: JSON inválido — ${err.message}`];
  }
  errors.push(...lintManifest(manifest).map((error) => `${manifestPath}: ${error}`));

  const readmePath = path.join(entryDir, "README.md");
  if (!existsSync(readmePath)) {
    errors.push(`${readmePath}: arquivo ausente`);
  } else {
    errors.push(
      ...lintReadmeHeadings(readFileSync(readmePath, "utf8"), contractHeadings).map((error) => `${readmePath}: ${error}`),
    );
  }

  const changelogPath = path.join(entryDir, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    errors.push(`${changelogPath}: arquivo ausente`);
  } else if (manifest.version) {
    errors.push(
      ...lintChangelogVersion(readFileSync(changelogPath, "utf8"), manifest.version).map(
        (error) => `${changelogPath}: ${error}`,
      ),
    );
  }

  const webFiles = [...readWebLayer(entryDir, "core"), ...readWebLayer(entryDir, "react")];
  errors.push(...lintWebImports(webFiles));

  errors.push(...lintProductionTestingImports(entryDir));

  return errors;
}

function lintAdvisories(dir) {
  if (!existsSync(dir)) return [];
  const errors = [];
  for (const name of readdirSync(dir)) {
    if (!isAdvisoryFilename(name)) continue;
    const filePath = path.join(dir, name);
    errors.push(
      ...lintAdvisoryFrontmatter(readFileSync(filePath, "utf8"), filePath).map((error) => `${filePath}: ${error}`),
    );
  }
  return errors;
}

export function runLint({
  catalogRoot = "catalog",
  contractPath = "docs/catalog/README-contract.md",
  advisoriesDir = "docs/advisories",
} = {}) {
  const contractHeadings = existsSync(contractPath) ? extractContractHeadings(readFileSync(contractPath, "utf8")) : [];
  const errors = [];
  for (const entryDir of discoverEntries(catalogRoot)) {
    errors.push(...lintEntry(entryDir, contractHeadings));
  }
  errors.push(...lintAdvisories(advisoriesDir));
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = runLint();
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exit(1);
  }
  process.exit(0);
}
