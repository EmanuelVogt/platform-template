import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { AdvisoryParseError, parseAdvisory } from "./frontmatter.mjs";
import { ManifestValidationError, validateManifest } from "./manifest.mjs";

const WEB_CORE_ALLOWED = ["zod", "@platform/api-client"];
const WEB_REACT_ALLOWED = [...WEB_CORE_ALLOWED, "@tanstack/react-query"];
const IMPORT_RE = /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const HEADING_RE = /^## .+$/gm;
const CONTRACT_FENCE_RE = /```\n([\s\S]*?)```/;

function isAllowedSpecifier(specifier, allowed) {
  if (specifier.startsWith(".")) return true;
  return allowed.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

function importsFrom(source) {
  const specifiers = [];
  const re = new RegExp(IMPORT_RE);
  let match;
  while ((match = re.exec(source))) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

export function extractContractHeadings(contractMarkdown) {
  const fence = CONTRACT_FENCE_RE.exec(contractMarkdown);
  if (!fence) return [];
  return fence[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// Posicional: a ordem das seções importa tanto quanto o texto exato.
export function lintReadmeHeadings(readmeMarkdown, expectedHeadings) {
  const found = [...readmeMarkdown.matchAll(HEADING_RE)].map((m) => m[0].trim());
  const errors = [];
  expectedHeadings.forEach((heading, index) => {
    if (found[index] !== heading) {
      errors.push(`seção esperada "${heading}" na posição ${index + 1}, encontrado "${found[index] ?? "(ausente)"}"`);
    }
  });
  return errors;
}

// Formato keep-a-changelog: heading `## [<version>]`.
export function lintChangelogVersion(changelogMarkdown, version) {
  const heading = `## [${version}]`;
  return changelogMarkdown.includes(heading) ? [] : [`sem heading para a versão ${version} (esperado "${heading}")`];
}

// Allow-list de AD-018: web/core é TS puro, web/react soma react-query — nunca router/UI.
export function lintWebImports(files) {
  const errors = [];
  for (const { path: filePath, content, layer } of files) {
    const allowed = layer === "react" ? WEB_REACT_ALLOWED : WEB_CORE_ALLOWED;
    for (const specifier of importsFrom(content)) {
      if (!isAllowedSpecifier(specifier, allowed)) {
        errors.push(`${filePath}: import não permitido em web/${layer}: ${specifier}`);
      }
    }
  }
  return errors;
}

export function lintManifest(manifest) {
  try {
    validateManifest(manifest);
    return [];
  } catch (err) {
    if (err instanceof ManifestValidationError) return err.errors;
    throw err;
  }
}

export function lintAdvisoryFrontmatter(content, filePath) {
  try {
    parseAdvisory(content, filePath);
    return [];
  } catch (err) {
    if (err instanceof AdvisoryParseError) return [err.message];
    throw err;
  }
}

// Para em módulos com variant: catalog/<name>/<variant>/module.json não descende além do module.json encontrado.
export function discoverEntries(root) {
  if (!existsSync(root)) return [];
  const entries = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (existsSync(path.join(dir, "module.json"))) {
      entries.push(dir);
      continue;
    }
    for (const child of readdirSync(dir, { withFileTypes: true })) {
      if (child.isDirectory()) stack.push(path.join(dir, child.name));
    }
  }
  return entries;
}
