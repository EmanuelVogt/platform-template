import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import { AdvisoryParseError, parseAdvisory } from "./frontmatter.mjs";

const LEDGER_LINE_RE = /^-\s*(ADV-\d{8}-\d{2})\b/;
const ADVISORY_FILENAME_RE = /^ADV-\d{8}-\d{2}\.md$/;

export { AdvisoryParseError, parseAdvisory };

export function isAdvisoryFilename(name) {
  return ADVISORY_FILENAME_RE.test(name);
}

export function loadAdvisories(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => isAdvisoryFilename(entry))
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

export function computePending(lock, advisories, ledger, { templateVersion } = {}) {
  const installedModules = lock?.modules ?? {};
  const noLock = Object.keys(installedModules).length === 0;
  const appliedIds = new Set(ledger ?? []);
  const pending = [];

  for (const advisory of advisories) {
    if (appliedIds.has(advisory.id)) {
      continue;
    }
    if (advisory.module === "kernel") {
      if (!templateVersion) {
        continue;
      }
      if (!semver.satisfies(templateVersion, advisory.affects)) {
        continue;
      }
      pending.push({ id: advisory.id, kind: advisory.kind, severity: advisory.severity, module: advisory.module });
      continue;
    }
    if (noLock) {
      continue;
    }
    const { name, variant } = parseModuleRef(advisory.module);
    const installed = installedModules[name];
    if (!installed) {
      continue;
    }
    if (variant && installed.variant !== variant) {
      continue;
    }
    if (!semver.satisfies(installed.version, advisory.affects)) {
      continue;
    }
    pending.push({ id: advisory.id, kind: advisory.kind, severity: advisory.severity, module: advisory.module });
  }

  return { noLock, pending };
}
