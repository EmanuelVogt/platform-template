import { spawnSync } from "node:child_process";

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
