import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readLock, writeLock as persistLock } from "./lock.mjs";

export function copyFiles(files) {
  for (const { from, to } of files) {
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, readFileSync(from));
  }
}

// Guards que afirmam um fato do template ("nasce sem entrada instalada") e que
// a primeira instalação torna falso — o produto herda a regra, não o fato. Sem
// caminho de volta: `--rollback` não os recria, porque um repositório que já
// instalou não volta a ser o template.
export const TEMPLATE_ONLY_FILES = ["apps/api/src/modules/template-kernel-only.spec.ts"];

export function removeTemplateOnlyFiles(cwd) {
  const removed = [];
  for (const relPath of TEMPLATE_ONLY_FILES) {
    const filePath = path.join(cwd, relPath);
    if (!existsSync(filePath)) continue;
    rmSync(filePath);
    removed.push(relPath);
  }
  return removed;
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function envBlockLines(moduleName, envVars, valueOf) {
  return [`# ${moduleName}`, ...envVars.map((envVar) => `${envVar.name}=${valueOf(envVar) ?? ""}`)];
}

function appendLines(filePath, lines) {
  const content = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const prefix = content.length === 0 ? "" : content.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(filePath, `${content}${prefix}${lines.join("\n")}\n`, "utf8");
}

function appendEnvExampleBlock(filePath, moduleName, envVars) {
  const content = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  if (content.includes(`# ${moduleName}`)) return;
  appendLines(filePath, envBlockLines(moduleName, envVars, (envVar) => envVar.example));
}

function appendEnvMissingKeys(filePath, moduleName, envVars) {
  const content = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const existingKeys = new Set(
    content
      .split("\n")
      .map((line) => line.match(/^([A-Za-z0-9_]+)=/)?.[1])
      .filter(Boolean),
  );
  const missing = envVars.filter((envVar) => !existingKeys.has(envVar.name));
  if (missing.length === 0) return;

  const hasMarker = content.includes(`# ${moduleName}`);
  const lines = hasMarker
    ? missing.map((envVar) => `${envVar.name}=${envVar.example ?? ""}`)
    : envBlockLines(moduleName, missing, (envVar) => envVar.example);
  appendLines(filePath, lines);
}

export function writeEnv({ envExamplePath, envPath, moduleName, envVars }) {
  if (!envVars || envVars.length === 0) return;
  appendEnvExampleBlock(envExamplePath, moduleName, envVars);
  appendEnvMissingKeys(envPath, moduleName, envVars);
}

function removeEnvBlock(filePath, moduleName) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split("\n");
  const markerIndex = lines.indexOf(`# ${moduleName}`);
  if (markerIndex === -1) return;

  let endIndex = markerIndex + 1;
  while (endIndex < lines.length && lines[endIndex] !== "" && !lines[endIndex].startsWith("#")) {
    endIndex++;
  }

  const before = lines.slice(0, markerIndex);
  while (before.length > 0 && before[before.length - 1] === "") before.pop();
  const after = lines.slice(endIndex);
  while (after.length > 0 && after[0] === "") after.shift();

  const rebuilt = [...before, ...(before.length > 0 && after.length > 0 ? [""] : []), ...after];
  const finalContent = rebuilt.length > 0 ? `${rebuilt.join("\n")}\n` : "";
  writeFileSync(filePath, finalContent, "utf8");
}

function renderPlatformModules(entries) {
  const withApi = entries.filter((entry) => entry.apiModule);
  const header = "// gerado por `pnpm platform module` — não edite à mão\n";
  if (withApi.length === 0) {
    return `${header}\nexport const PLATFORM_MODULES = [] as const;\n`;
  }

  // `import-x/order` classifica o import type de "@nestjs/common" no grupo "type" (o último
  // dos grupos configurados), então os imports sibling (`./modules/...`) vêm antes dele,
  // alfabetizados, com uma linha em branco separando os dois grupos.
  const sortedByPath = [...withApi].sort((a, b) =>
    a.apiModule.path.localeCompare(b.apiModule.path, undefined, { sensitivity: "base" }),
  );
  const imports = sortedByPath
    .map((entry) => `import { ${entry.apiModule.export} } from "./${entry.apiModule.path}";`)
    .join("\n");
  const list = withApi.map((entry) => `resolvePlatformModule(${entry.apiModule.export})`).join(", ");
  // Alguns módulos do catálogo expõem um `forRoot()` estático (dynamic module do Nest) em vez
  // de serem referenciáveis como classe direto — chamamos quando existe, senão registramos a
  // classe direto.
  const resolver =
    "function resolvePlatformModule(mod: Type<unknown> & { forRoot?: () => DynamicModule }): Type<unknown> | DynamicModule {\n" +
    '  return typeof mod.forRoot === "function" ? mod.forRoot() : mod;\n' +
    "}";
  return (
    `${header}${imports}\n\n` +
    `import type { DynamicModule, Type } from "@nestjs/common";\n\n` +
    `${resolver}\n\nexport const PLATFORM_MODULES = [${list}] as const;\n`
  );
}

function renderPlatformSchema(entries) {
  const header = "// gerado por `pnpm platform module` — não edite à mão\n";
  const lines = entries.flatMap((entry) => (entry.schemaExports ?? []).map((exportPath) => `export * from "../${exportPath}";`));
  return lines.length > 0 ? `${header}\n${lines.join("\n")}\n` : `${header}\n`;
}

export function writeRegistry({ entries, platformModulesPath, platformSchemaPath }) {
  mkdirSync(path.dirname(platformModulesPath), { recursive: true });
  mkdirSync(path.dirname(platformSchemaPath), { recursive: true });
  writeFileSync(platformModulesPath, renderPlatformModules(entries), "utf8");
  writeFileSync(platformSchemaPath, renderPlatformSchema(entries), "utf8");
}

export function writeLock({ lockPath, lock, name, entry }) {
  const filesWithSha = entry.files.map((filePath) => ({ path: filePath, sha256: sha256File(filePath) }));
  const nextLock = {
    ...lock,
    modules: { ...lock.modules, [name]: { ...entry, files: filesWithSha } },
  };
  persistLock(lockPath, nextLock);
  return nextLock;
}

export function rollback({ lockPath, name, envExamplePath, envPath, registry }) {
  const lock = readLock(lockPath);
  const entry = lock.modules?.[name];
  if (!entry) return lock;

  for (const file of entry.files ?? []) {
    if (existsSync(file.path)) rmSync(file.path);
  }

  removeEnvBlock(envExamplePath, name);
  removeEnvBlock(envPath, name);

  const { [name]: _removed, ...remainingModules } = lock.modules;
  const nextLock = { ...lock, modules: remainingModules };
  persistLock(lockPath, nextLock);

  if (registry) {
    writeRegistry({
      entries: registry.entries,
      platformModulesPath: registry.platformModulesPath,
      platformSchemaPath: registry.platformSchemaPath,
    });
  }

  return nextLock;
}
