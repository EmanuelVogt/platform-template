import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { expandGitShorthand, isGitRef } from "./catalog-source.mjs";

const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
// `_commit` é o `git describe --tags` do template no momento da cópia: `v2.0.0` em cima
// da tag, `v2.0.0-3-gabc1234` quando o produto nasceu de um commit depois dela.
const DESCRIBED = /^v?(\d+)\.(\d+)\.(\d+)(?:-(\d+)-g[0-9a-f]+)?$/;

export class TemplateUnreachableError extends Error {
  constructor(source, reason) {
    super(`template inacessível: ${source} — ${reason}`);
    this.name = "TemplateUnreachableError";
    this.source = source;
  }
}

export function parseSemverTag(tag) {
  const match = STABLE_TAG.exec(tag);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function compareSemver(a, b) {
  const left = parseSemverTag(a);
  const right = parseSemverTag(b);
  if (!left || !right) throw new TypeError(`tag fora do padrão vX.Y.Z: ${!left ? a : b}`);
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

export function parseInstalledVersion(commit) {
  if (typeof commit !== "string") return undefined;
  const match = DESCRIBED.exec(commit.trim());
  if (!match) return undefined;
  return { version: `v${match[1]}.${match[2]}.${match[3]}`, aheadBy: Number(match[4] ?? 0) };
}

export function readTemplateOrigin(answersPath) {
  if (!existsSync(answersPath)) return undefined;
  const answers = parseYaml(readFileSync(answersPath, "utf8")) ?? {};
  if (typeof answers._src_path !== "string") return undefined;
  return { source: answers._src_path, commit: typeof answers._commit === "string" ? answers._commit : undefined };
}

export function stableTagsFromLsRemote(output) {
  return output
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((ref) => ref?.startsWith("refs/tags/"))
    .map((ref) => ref.slice("refs/tags/".length))
    .filter((tag) => STABLE_TAG.test(tag))
    .sort(compareSemver);
}

export function listRemoteStableTags(source, { timeoutMs = 8000, exec = execFileSync } = {}) {
  const remote = isGitRef(source) ? expandGitShorthand(source) : source;
  try {
    const output = exec("git", ["ls-remote", "--tags", "--refs", remote, "v*"], {
      stdio: "pipe",
      encoding: "utf8",
      timeout: timeoutMs,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return stableTagsFromLsRemote(String(output));
  } catch (err) {
    throw new TemplateUnreachableError(source, err.message);
  }
}

export function cachedRemoteStableTags(
  source,
  { cachePath, ttlMs = 24 * 60 * 60 * 1000, now = Date.now(), fetchTags = listRemoteStableTags } = {},
) {
  if (cachePath && existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf8"));
      if (cached.source === source && now - cached.checkedAt < ttlMs && Array.isArray(cached.tags)) {
        return cached.tags;
      }
    } catch {
      // cache corrompido vale o mesmo que cache ausente
    }
  }
  const tags = fetchTags(source);
  if (cachePath) writeFileSync(cachePath, JSON.stringify({ source, checkedAt: now, tags }));
  return tags;
}

export function computeTemplateStatus({ commit, tags }) {
  const installed = parseInstalledVersion(commit);
  const latest = tags.length > 0 ? tags[tags.length - 1] : undefined;
  if (!installed) return { installed: undefined, aheadBy: 0, latest, behind: tags };
  const behind = tags.filter((tag) => compareSemver(tag, installed.version) > 0);
  return { installed: installed.version, aheadBy: installed.aheadBy, latest, behind };
}

// Extraída do hook (T7) para ser pura e testável: assume `status.behind.length > 0`,
// já garantido pelo chamador.
export function buildTemplateBehindReport({ status, pendingKernelAdvisories = [] }) {
  const ahead = status.aheadBy > 0 ? ` (installed from a commit ${status.aheadBy} past that tag)` : "";
  const lines = [
    `template behind: installed ${status.installed}${ahead}, latest ${status.latest} — ${status.behind.length} tag(s): ${status.behind.join(", ")}`,
    "run the template-update skill (pnpm platform status for the full picture)",
  ];
  for (const advisory of pendingKernelAdvisories) {
    const firstFixLine = String(advisory.fix ?? "").split("\n")[0];
    lines.push(`${advisory.id} ${advisory.kind} ${advisory.severity} kernel — fix: ${firstFixLine}`);
  }
  return lines.join("\n");
}

export function formatTemplateStatus(source, status) {
  const { installed, aheadBy, latest, behind } = status;
  const installedLabel = installed ? `${installed}${aheadBy > 0 ? `+${aheadBy}` : ""}` : "(desconhecida)";
  const head = `template: ${source} installed=${installedLabel} latest=${latest ?? "(desconhecida)"}`;
  if (!installed || !latest) return head;
  if (behind.length === 0) return `${head} — atualizado`;
  return `${head} — ${behind.length} versão(ões) atrás: ${behind.join(", ")}`;
}
