import { spawnSync } from "node:child_process";
import path from "node:path";
import { readChangelogSection } from "./lib/kernel-version.mjs";

const CHANGELOG_RELATIVE_PATH = "docs/dev/template-changelog.md";
const BRANCH_PREFIX = "chore/template-update-";
// copier 9.17.2 default é --conflict=inline: um conflito não sobrevive como
// `*.rej` (o arquivo é apagado após o merge de 3 vias), só como estas duas
// linhas literais gravadas no arquivo por `git merge-file` — checado contra
// o binário instalado (copier update --help; site-packages/copier/_main.py).
const CONFLICT_MARKERS = ["<<<<<<< before updating", ">>>>>>> after updating"];

// Nunca lança por comando que falhou: devolve status/stdout/stderr para quem
// chama decidir (mesmo contrato de scripts/platform/catalog-check.mjs).
export function defaultRun(command, args = [], options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

// `openIssues` fica na assinatura por paridade com o design mas não decide
// nada aqui: o create-or-comment de issue é resolvido por `runUpdate`.
export function planUpdate({ status, openPrs = [], closedPrs = [], openIssues = [] } = {}) {
  void openIssues;
  const behind = status?.template?.behind ?? [];
  if (behind.length === 0) return { action: "none", tag: undefined, reason: "up-to-date" };
  const tag = behind[0];
  if (openPrs.includes(tag)) return { action: "none", tag, reason: "pr-open" };
  if (closedPrs.includes(tag)) return { action: "none", tag, reason: "pr-closed" };
  return { action: "update", tag, reason: "behind" };
}

function tail(text, lines = 40) {
  return text.split("\n").slice(-lines).join("\n");
}

function scanConflicts(run) {
  const result = run("git", ["grep", "-l", "-e", CONFLICT_MARKERS[0], "-e", CONFLICT_MARKERS[1]]);
  if (result.status !== 0) return [];
  return result.stdout.split("\n").filter(Boolean);
}

function extractTagFromBranch(branch) {
  return branch.startsWith(BRANCH_PREFIX) ? branch.slice(BRANCH_PREFIX.length) : undefined;
}

// `state: "closed"` já exclui as PRs mergeadas — planUpdate só quer as
// fechadas sem merge (a mergeada some de `status.template.behind` sozinha).
export function listPrTags({ run, state }) {
  const result = run("gh", ["pr", "list", "--state", state, "--json", "headRefName,mergedAt"]);
  if (result.status !== 0) return [];
  let prs;
  try {
    prs = JSON.parse(result.stdout || "[]");
  } catch {
    return [];
  }
  return prs
    .filter((pr) => state !== "closed" || !pr.mergedAt)
    .map((pr) => extractTagFromBranch(pr.headRefName))
    .filter(Boolean);
}

function blockedIssueTitle(tag) {
  return `template update to ${tag} blocked`;
}

function openOrCommentIssue({ tag, run, log, body }) {
  const title = blockedIssueTitle(tag);
  const listResult = run("gh", ["issue", "list", "--state", "open", "--search", `"${title}" in:title`, "--json", "number,title"]);
  let existing;
  try {
    existing = (JSON.parse(listResult.stdout || "[]")).find((issue) => issue.title === title);
  } catch {
    existing = undefined;
  }
  if (existing) {
    log(`template-update-ci: comentando na issue #${existing.number} (${title})`);
    run("gh", ["issue", "comment", String(existing.number), "--body", body]);
    return;
  }
  log(`template-update-ci: abrindo issue "${title}"`);
  run("gh", ["issue", "create", "--title", title, "--body", body]);
}

// Para no primeiro passo que falhar (copier/migrate/install/check/test);
// só chega no push+PR se todos os passos anteriores saírem com status 0.
export function runUpdate({ tag, run = defaultRun, log = () => {}, repoRoot = process.cwd() } = {}) {
  const branch = `${BRANCH_PREFIX}${tag}`;
  log(`template-update-ci: branch ${branch}`);
  run("git", ["checkout", "-b", branch]);
  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "github-actions[bot]@users.noreply.github.com"]);

  const copierResult = run("copier", ["update", "--trust", "--vcs-ref", tag]);
  if (copierResult.status !== 0) {
    log("template-update-ci: copier update falhou — se a origem for privada, configure TEMPLATE_READ_TOKEN");
    return { outcome: "unreachable", tag };
  }

  const conflicts = scanConflicts(run);
  if (conflicts.length > 0) {
    openOrCommentIssue({
      tag,
      run,
      log,
      body: `Arquivos em conflito após \`copier update\`:\n${conflicts.map((f) => `- ${f}`).join("\n")}`,
    });
    return { outcome: "blocked", tag, reason: "conflict", conflicts };
  }

  const steps = [
    ["pnpm", ["platform", "template", "migrate"]],
    ["pnpm", ["install"]],
    ["pnpm", ["check"]],
    ["pnpm", ["test"]],
  ];
  for (const [command, args] of steps) {
    const result = run(command, args);
    if (result.status !== 0) {
      const stepLabel = [command, ...args].join(" ");
      openOrCommentIssue({
        tag,
        run,
        log,
        body: `\`${stepLabel}\` falhou:\n\`\`\`\n${tail(`${result.stdout}\n${result.stderr}`)}\n\`\`\``,
      });
      return { outcome: "blocked", tag, reason: "gate", step: stepLabel };
    }
  }

  run("git", ["add", "-A"]);
  run("git", ["commit", "-m", `chore(template): update to ${tag}`]);
  run("git", ["push", "--set-upstream", "origin", branch]);
  const section = readChangelogSection(path.join(repoRoot, CHANGELOG_RELATIVE_PATH), tag.replace(/^v/, ""));
  run("gh", [
    "pr",
    "create",
    "--title",
    `chore(template): update to ${tag}`,
    "--body",
    section,
    "--head",
    branch,
  ]);
  return { outcome: "pr", tag };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const status = JSON.parse(defaultRun("pnpm", ["platform", "status", "--json"]).stdout || "{}");
  const openPrs = listPrTags({ run: defaultRun, state: "open" });
  const closedPrs = listPrTags({ run: defaultRun, state: "closed" });
  const plan = planUpdate({ status, openPrs, closedPrs });
  if (plan.action === "none") {
    process.stdout.write(`template-update-ci: ${plan.reason} — nada a fazer\n`);
    process.exit(0);
  }
  const result = runUpdate({ tag: plan.tag, run: defaultRun, log: (line) => process.stdout.write(`${line}\n`) });
  process.exit(result.outcome === "unreachable" ? 1 : 0);
}
