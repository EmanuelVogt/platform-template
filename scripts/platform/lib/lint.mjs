import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import { AdvisoryParseError, parseAdvisory } from "./frontmatter.mjs";
import { ManifestValidationError, validateManifest } from "./manifest.mjs";

const WEB_CORE_ALLOWED = ["zod", "@platform/api-client"];
const WEB_REACT_ALLOWED = [...WEB_CORE_ALLOWED, "@tanstack/react-query"];
const WEB_CORE_TEST_EXTRA = ["vitest"];
const WEB_REACT_TEST_EXTRA = [...WEB_CORE_TEST_EXTRA, "@testing-library/react"];
const TEST_FILE_RE = /\.test\.tsx?$/;
const IMPORT_RE = /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const HEADING_RE = /^## .+$/gm;
const CONTRACT_FENCE_RE = /```\n([\s\S]*?)```/;
const API_TEST_SUFFIX_RE = /\.(spec|int-spec|e2e-spec|parity\.spec|fixture)\.ts$/;
const API_TEST_DIR_RE = /(^|\/)(testing|__e2e__|parity)\//;
const TESTING_SPECIFIER_RE = /\/testing\//;

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
// *.test.ts(x) soma vitest (e, em web/react, @testing-library/react para renderHook); o resto da lista continua proibido.
export function lintWebImports(files) {
  const errors = [];
  for (const { path: filePath, content, layer } of files) {
    const isReact = layer === "react";
    const base = isReact ? WEB_REACT_ALLOWED : WEB_CORE_ALLOWED;
    const allowed = TEST_FILE_RE.test(filePath) ? [...base, ...(isReact ? WEB_REACT_TEST_EXTRA : WEB_CORE_TEST_EXTRA)] : base;
    for (const specifier of importsFrom(content)) {
      if (!isAllowedSpecifier(specifier, allowed)) {
        errors.push(`${filePath}: import não permitido em web/${layer}: ${specifier}`);
      }
    }
  }
  return errors;
}

function walkTsFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

// AD-023/AD-031: testing/, __e2e__/ e parity/ ficam fora do build (nest-cli.json,
// tsconfig.build.json) — código de produção que importa de lá quebra em runtime.
export function lintProductionTestingImports(entryDir) {
  const apiDir = path.join(entryDir, "api");
  const errors = [];
  for (const filePath of walkTsFiles(apiDir)) {
    const relativeToApi = path.relative(apiDir, filePath).split(path.sep).join("/");
    if (API_TEST_SUFFIX_RE.test(relativeToApi) || API_TEST_DIR_RE.test(relativeToApi)) continue;
    for (const specifier of importsFrom(readFileSync(filePath, "utf8"))) {
      if (TESTING_SPECIFIER_RE.test(specifier)) {
        errors.push(`${filePath}: código de produção importa de testing/: ${specifier}`);
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

// A versão mais recente do changelog é a que catalog:check simula e a que a próxima tag
// carrega (AD-006): um range que a exclui só aparece no child, como exit 8 (issue #9).
export function lintKernelRange(manifest, kernelVersion) {
  if (!manifest.kernelRange || !semver.validRange(manifest.kernelRange)) return [];
  if (semver.satisfies(kernelVersion, manifest.kernelRange)) return [];
  return [
    `kernelRange "${manifest.kernelRange}" não aceita o kernel ${kernelVersion} (versão mais recente de docs/dev/template-changelog.md) — nenhum child nessa versão consegue instalar a entrada; abra o range junto com o bump`,
  ];
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

export function lintAdvisoryModule(advisory, entryNames) {
  if (advisory.module === "kernel" || entryNames.includes(advisory.module)) return [];
  return [`module "${advisory.module}" não é "kernel" nem uma entrada existente do catálogo (${advisory.id})`];
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
