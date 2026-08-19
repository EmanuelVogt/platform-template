import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import { parse as parseYaml } from "yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const REQUIRED_FIELDS = ["id", "kind", "module", "affects", "severity", "detect", "fix", "parity"];
const ALLOWED_KINDS = new Set(["bug", "security", "breaking"]);
const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const LEDGER_LINE_RE = /^-\s*(ADV-\d{8}-\d{2})\b/;

export class AdvisoryParseError extends Error {
  constructor(filePath, detail) {
    super(`advisory inválido em ${filePath}: ${detail}`);
    this.name = "AdvisoryParseError";
    this.filePath = filePath;
  }
}

export function parseAdvisory(md, filePath = "<advisory>") {
  const match = FRONTMATTER_RE.exec(md);
  if (!match) {
    throw new AdvisoryParseError(filePath, "frontmatter YAML ausente");
  }

  const frontmatter = parseYaml(match[1]);
  if (frontmatter === null || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new AdvisoryParseError(filePath, "frontmatter deve ser um objeto");
  }

  for (const field of REQUIRED_FIELDS) {
    const value = frontmatter[field];
    if (value === undefined || value === null || value === "") {
      throw new AdvisoryParseError(filePath, `campo obrigatório ausente: ${field}`);
    }
  }

  if (!ALLOWED_KINDS.has(frontmatter.kind)) {
    throw new AdvisoryParseError(filePath, `kind inválido: ${frontmatter.kind}`);
  }

  if (!ALLOWED_SEVERITIES.has(frontmatter.severity)) {
    throw new AdvisoryParseError(filePath, `severity inválido: ${frontmatter.severity}`);
  }

  if (!semver.validRange(frontmatter.affects)) {
    throw new AdvisoryParseError(filePath, `affects inválido (semver range esperado): ${frontmatter.affects}`);
  }

  return {
    id: frontmatter.id,
    kind: frontmatter.kind,
    module: frontmatter.module,
    affects: frontmatter.affects,
    severity: frontmatter.severity,
    detect: frontmatter.detect,
    fix: frontmatter.fix,
    parity: frontmatter.parity,
    body: match[2].trim(),
  };
}

export function loadAdvisories(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .sort()
    .map((entry) => {
      const filePath = path.join(dir, entry);
      return parseAdvisory(readFileSync(filePath, "utf8"), filePath);
    });
}

export function readLedger(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = readFileSync(filePath, "utf8");
  const ids = [];
  for (const line of raw.split("\n")) {
    const match = LEDGER_LINE_RE.exec(line.trim());
    if (match) {
      ids.push(match[1]);
    }
  }
  return ids;
}

function parseModuleRef(moduleField) {
  const [name, variant] = moduleField.split("/");
  return { name, variant };
}

export function computePending(lock, advisories, ledger) {
  const installedModules = lock?.modules ?? {};
  if (Object.keys(installedModules).length === 0) {
    return { noLock: true, pending: [] };
  }

  const appliedIds = new Set(ledger ?? []);
  const pending = [];

  for (const advisory of advisories) {
    const { name, variant } = parseModuleRef(advisory.module);
    const installed = installedModules[name];
    if (!installed) {
      continue;
    }
    if (variant && installed.variant !== variant) {
      continue;
    }
    if (appliedIds.has(advisory.id)) {
      continue;
    }
    if (!semver.satisfies(installed.version, advisory.affects)) {
      continue;
    }
    pending.push({ id: advisory.id, kind: advisory.kind, severity: advisory.severity, module: advisory.module });
  }

  return { noLock: false, pending };
}
