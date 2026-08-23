import path from "node:path";
import { computePending, loadAdvisories, readLedger } from "../advisories.mjs";
import { EXIT_CODES } from "../exit-codes.mjs";
import { readLock } from "../lock.mjs";
import {
  computeTemplateStatus,
  formatTemplateStatus,
  listRemoteStableTags,
  readTemplateOrigin,
} from "../template-version.mjs";

export function collectStatus({ cwd, offline, fetchTags = listRemoteStableTags }) {
  const origin = readTemplateOrigin(path.join(cwd, ".copier-answers.yml"));
  let template;
  if (!origin) {
    template = { source: undefined, error: ".copier-answers.yml ausente ou sem _src_path" };
  } else {
    let tags = [];
    let error;
    if (!offline) {
      try {
        tags = fetchTags(origin.source);
      } catch (err) {
        error = err.message;
      }
    }
    template = { source: origin.source, ...computeTemplateStatus({ commit: origin.commit, tags }), error };
  }

  const lock = readLock(path.join(cwd, ".platform-modules.lock"));
  const modules = Object.entries(lock.modules ?? {}).map(([name, entry]) => ({
    name: entry.variant ? `${name}/${entry.variant}` : name,
    version: entry.version,
  }));

  const advisoriesDir = path.join(cwd, "docs", "advisories");
  let advisories;
  try {
    const { noLock, pending } = computePending(
      lock,
      loadAdvisories(advisoriesDir),
      readLedger(path.join(advisoriesDir, "APPLIED.md")),
    );
    advisories = { noLock, pending: pending.map((a) => ({ id: a.id, kind: a.kind, severity: a.severity, module: a.module })) };
  } catch (err) {
    advisories = { noLock: false, pending: [], error: err.message };
  }

  return { template, modules, advisories };
}

function formatModules(modules) {
  if (modules.length === 0) return "modules: nenhum instalado";
  const list = modules.map((m) => `${m.name} lock=${m.version}`).join(", ");
  return `modules: ${list} (catálogo: pnpm platform module list)`;
}

function formatAdvisories(advisories) {
  if (advisories.error) return `advisories: ilegíveis — ${advisories.error}`;
  if (advisories.noLock) return "advisories: sem .platform-modules.lock — rode pnpm platform module adopt";
  if (advisories.pending.length === 0) return "advisories: nenhuma pendente";
  const list = advisories.pending.map((a) => `${a.id} (${a.severity} ${a.module})`).join(", ");
  return `advisories: ${advisories.pending.length} pendente(s) — ${list}`;
}

export async function statusCommand({ options = {}, cwd = process.cwd(), fetchTags } = {}) {
  const status = collectStatus({ cwd, offline: options.offline === true, fetchTags });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return EXIT_CODES.OK;
  }

  const lines = [];
  if (status.template.error && !status.template.source) {
    lines.push(`template: ${status.template.error}`);
  } else {
    lines.push(formatTemplateStatus(status.template.source, status.template));
    if (status.template.error) lines.push(`template: remoto não consultado — ${status.template.error}`);
    if (options.offline) lines.push("template: --offline, última versão não consultada");
  }
  lines.push(formatModules(status.modules), formatAdvisories(status.advisories));

  process.stdout.write(`${lines.join("\n")}\n`);
  return EXIT_CODES.OK;
}
