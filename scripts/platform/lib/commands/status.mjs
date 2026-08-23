import path from "node:path";
import { fetchRemoteAdvisories } from "../advisory-feed.mjs";
import { computePending, loadAdvisories, readLedger } from "../advisories.mjs";
import { advisoryIdDate, ageDays, isOverdue } from "../cadence.mjs";
import { EXIT_CODES } from "../exit-codes.mjs";
import { readLock } from "../lock.mjs";
import {
  computeTemplateStatus,
  formatTemplateStatus,
  listRemoteStableTags,
  parseInstalledVersion,
  readTemplateOrigin,
} from "../template-version.mjs";

export function collectStatus({
  cwd,
  offline,
  fetchTags = listRemoteStableTags,
  fetchFeed = fetchRemoteAdvisories,
  now = Date.now(),
}) {
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

  // CAD-02: só busca o feed quando há tag(s) atrás — reaproveita a tagDate do feed
  // sem exigir novo fetch quando o produto já está atualizado.
  if (origin && !offline && template.behind?.length > 0 && template.latest) {
    try {
      const feed = fetchFeed(origin.source, template.latest, { now });
      if (feed?.tagDate) {
        template.latestPublishedDaysAgo = ageDays(feed.tagDate.slice(0, 10), now);
      }
    } catch {
      // FEED-03: o feed é best-effort aqui também — sem tagDate, sem a linha extra.
    }
  }

  const lock = readLock(path.join(cwd, ".platform-modules.lock"));
  const modules = Object.entries(lock.modules ?? {}).map(([name, entry]) => ({
    name: entry.variant ? `${name}/${entry.variant}` : name,
    version: entry.version,
  }));

  const templateVersion = origin ? parseInstalledVersion(origin.commit)?.version : undefined;
  const advisoriesDir = path.join(cwd, "docs", "advisories");
  let advisories;
  try {
    const { noLock, pending } = computePending(
      lock,
      loadAdvisories(advisoriesDir),
      readLedger(path.join(advisoriesDir, "APPLIED.md")),
      { templateVersion },
    );
    advisories = { noLock, pending: pending.map((a) => toStatusAdvisory(a, now)) };
  } catch (err) {
    advisories = { noLock: false, pending: [], error: err.message };
  }

  return { template, modules, advisories };
}

// CAD-01: idade só é significativa contra a cadência de kernel — advisories de
// entrada seguem sem os campos novos (chaves aditivas).
function toStatusAdvisory(a, now) {
  const base = { id: a.id, kind: a.kind, severity: a.severity, module: a.module };
  if (a.module !== "kernel") return base;
  const idDate = advisoryIdDate(a.id);
  if (!idDate) return base;
  const days = ageDays(idDate, now);
  return { ...base, ageDays: days, overdue: isOverdue(a.kind, days) };
}

function formatModules(modules) {
  if (modules.length === 0) return "modules: nenhum instalado";
  const list = modules.map((m) => `${m.name} lock=${m.version}`).join(", ");
  return `modules: ${list} (catálogo: pnpm platform module list)`;
}

function formatAdvisoryEntry(a) {
  if (typeof a.ageDays !== "number") return `${a.id} (${a.severity} ${a.module})`;
  return `${a.id} (${a.severity} ${a.module}, ${a.ageDays}d${a.overdue ? " overdue" : ""})`;
}

function formatAdvisories(advisories) {
  if (advisories.error) return `advisories: ilegíveis — ${advisories.error}`;
  if (advisories.noLock) return "advisories: sem .platform-modules.lock — rode pnpm platform module adopt";
  if (advisories.pending.length === 0) return "advisories: nenhuma pendente";
  const list = advisories.pending.map(formatAdvisoryEntry).join(", ");
  return `advisories: ${advisories.pending.length} pendente(s) — ${list}`;
}

export async function statusCommand({ options = {}, cwd = process.cwd(), fetchTags, fetchFeed, now } = {}) {
  const status = collectStatus({ cwd, offline: options.offline === true, fetchTags, fetchFeed, now });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return EXIT_CODES.OK;
  }

  const lines = [];
  if (status.template.error && !status.template.source) {
    lines.push(`template: ${status.template.error}`);
  } else {
    lines.push(formatTemplateStatus(status.template.source, status.template));
    if (typeof status.template.latestPublishedDaysAgo === "number") {
      lines.push(`latest ${status.template.latest} published ${status.template.latestPublishedDaysAgo} days ago`);
    }
    if (status.template.error) lines.push(`template: remoto não consultado — ${status.template.error}`);
    if (options.offline) lines.push("template: --offline, última versão não consultada");
  }
  lines.push(formatModules(status.modules), formatAdvisories(status.advisories));

  process.stdout.write(`${lines.join("\n")}\n`);
  return EXIT_CODES.OK;
}
