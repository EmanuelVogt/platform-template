import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const IMPORT_RE = /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

// A lista real de `_exclude` do copier.yml — nunca uma cópia hard-coded, para que o guard
// acompanhe o arquivo sem duplicar manutenção.
export function parseExcludeList(copierYamlContent) {
  const doc = parseYaml(copierYamlContent) ?? {};
  return Array.isArray(doc._exclude) ? doc._exclude.filter((entry) => typeof entry === "string") : [];
}

function toPosix(relPath) {
  return relPath.split(path.sep).join("/");
}

// `_exclude` aceita âncoras de raiz ("/catalog"); os caminhos que comparamos aqui já são
// relativos à raiz do repo, então a âncora não muda o resultado — só precisa ser removida
// antes da comparação.
export function isExcludedPath(relPath, excludeList) {
  const posixPath = toPosix(relPath);
  return excludeList.some((entry) => {
    const normalized = entry.startsWith("/") ? entry.slice(1) : entry;
    return posixPath === normalized || posixPath.startsWith(`${normalized}/`);
  });
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

function walkScriptFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkScriptFiles(full));
    } else if (entry.name.endsWith(".mjs")) {
      out.push(full);
    }
  }
  return out;
}

// Para cada arquivo .mjs sob `scriptsRoot` que o filho de fato recebe (o próprio arquivo não
// está em `_exclude`), resolve os imports relativos e reporta os que apontam para um caminho
// que `_exclude` corta — essas importações quebrariam no filho em tempo de import.
export function findExcludedImports({ repoRoot, scriptsRoot = path.join(repoRoot, "scripts"), excludeList }) {
  const offenders = [];
  for (const file of walkScriptFiles(scriptsRoot)) {
    const relFile = toPosix(path.relative(repoRoot, file));
    if (isExcludedPath(relFile, excludeList)) continue;
    for (const specifier of importsFrom(readFileSync(file, "utf8"))) {
      if (!specifier.startsWith(".")) continue;
      const relImport = toPosix(path.relative(repoRoot, path.resolve(path.dirname(file), specifier)));
      if (isExcludedPath(relImport, excludeList)) {
        offenders.push({ file: relFile, specifier, resolved: relImport });
      }
    }
  }
  return offenders;
}
