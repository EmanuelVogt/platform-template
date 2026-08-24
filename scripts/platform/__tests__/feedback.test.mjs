import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { run } from "../cli.mjs";
import { classifyPath, feedbackCommand, githubRepoOf } from "../lib/commands/feedback.mjs";
import { EXIT_CODES } from "../lib/exit-codes.mjs";

function makeChild({ withAnswers = true, withLock = true, source = "gh:acme/platform-template" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "feedback-child-"));
  if (withAnswers) {
    writeFileSync(path.join(dir, ".copier-answers.yml"), `_src_path: ${source}\n_commit: v2.1.0\n`, "utf8");
  }
  if (withLock) {
    writeFileSync(
      path.join(dir, ".platform-modules.lock"),
      JSON.stringify({ modules: { tag: { version: "1.2.0", files: [] } } }),
      "utf8",
    );
  }
  return dir;
}

function writeDraft(dir, overrides = {}) {
  const {
    title = "Outbox retry loses the actor context",
    type = "bug",
    area = "kernel-api",
    paths = ["apps/api/src/shared/outbox/outbox.service.ts"],
    body = "## What\nDetail.\n\n## Evidence\nSnippet.\n\n## Suggested fix\nIdea.\n",
  } = overrides;
  mkdirSync(path.join(dir, ".platform-feedback"), { recursive: true });
  const file = path.join(dir, ".platform-feedback", "draft.md");
  const frontmatter = [`title: ${title}`, `type: ${type}`, `area: ${area}`, "paths:", ...paths.map((p) => `  - ${p}`)];
  writeFileSync(file, `---\n${frontmatter.join("\n")}\n---\n\n${body}`, "utf8");
  return file;
}

async function captureOutput(streamName, fn) {
  const stream = process[streamName];
  const original = stream.write.bind(stream);
  let output = "";
  stream.write = (chunk) => {
    output += chunk;
    return true;
  };
  try {
    const result = await fn();
    return { result, output };
  } finally {
    stream.write = original;
  }
}

test("rascunho válido: compõe corpo carimbado e imprime gh + URL", async () => {
  const dir = makeChild();
  const draft = writeDraft(dir);
  const { result, output } = await captureOutput("stdout", () =>
    feedbackCommand({ draftPath: draft, cwd: dir }),
  );

  assert.equal(result, EXIT_CODES.OK);
  assert.match(output, /gh issue create --repo acme\/platform-template --title 'Outbox retry loses the actor context'/);
  assert.match(output, /https:\/\/github\.com\/acme\/platform-template\/issues\/new\?title=/);

  const issue = readFileSync(path.join(dir, ".platform-feedback", "draft.issue.md"), "utf8");
  assert.match(issue, /## What/);
  assert.match(issue, /installed `v2\.1\.0`/);
  assert.match(issue, /- modules: tag@1\.2\.0/);
  assert.match(issue, /- paths: `apps\/api\/src\/shared\/outbox\/outbox\.service\.ts`/);
});

test("registrado no cli: run(['feedback', ...]) chega ao comando", async () => {
  const dir = makeChild();
  const draft = writeDraft(dir);
  const { result } = await captureOutput("stdout", () => run(["feedback", draft], { cwd: dir }));
  assert.equal(result, EXIT_CODES.OK);
});

test("--json: estrutura estável para o agente", async () => {
  const dir = makeChild();
  const draft = writeDraft(dir);
  const { result, output } = await captureOutput("stdout", () =>
    feedbackCommand({ draftPath: draft, options: { json: true }, cwd: dir }),
  );

  assert.equal(result, EXIT_CODES.OK);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.repo, "acme/platform-template");
  assert.equal(parsed.template.commit, "v2.1.0");
  assert.match(parsed.ghCommand, /gh issue create --repo acme\/platform-template/);
  assert.match(parsed.url, /issues\/new\?title=/);
  assert.equal(parsed.outFile, path.join(".platform-feedback", "draft.issue.md"));
});

test("caminho de negócio do produto é bloqueado", async () => {
  const dir = makeChild();
  const draft = writeDraft(dir, { paths: ["apps/api/src/modules/billing/billing.service.ts"] });
  const { result, output } = await captureOutput("stderr", () =>
    feedbackCommand({ draftPath: draft, cwd: dir }),
  );

  assert.equal(result, EXIT_CODES.FEEDBACK_BLOCKED);
  assert.match(output, /fora do escopo da plataforma: apps\/api\/src\/modules\/billing/);
  assert.equal(existsSync(path.join(dir, ".platform-feedback", "draft.issue.md")), false);
});

test("entrada instalada no lock passa; area catalog/<entry> sem lock é bloqueada", async () => {
  const dir = makeChild();
  const installed = writeDraft(dir, {
    area: "catalog/tag",
    paths: ["apps/api/src/modules/tag/api/tag.controller.ts"],
  });
  const ok = await captureOutput("stdout", () => feedbackCommand({ draftPath: installed, cwd: dir }));
  assert.equal(ok.result, EXIT_CODES.OK);

  const notInstalled = writeDraft(dir, {
    area: "catalog/identity",
    paths: ["apps/api/src/modules/identity/api/identity.controller.ts"],
  });
  const blocked = await captureOutput("stderr", () => feedbackCommand({ draftPath: notInstalled, cwd: dir }));
  assert.equal(blocked.result, EXIT_CODES.FEEDBACK_BLOCKED);
  assert.match(blocked.output, /entrada não instalada neste produto/);
});

test("segredo no corpo é bloqueado com a linha", async () => {
  const dir = makeChild();
  const draft = writeDraft(dir, {
    body: `## What\nx\n\n## Evidence\nghp_${"a".repeat(24)}\n\n## Suggested fix\ny\n`,
  });
  const { result, output } = await captureOutput("stderr", () =>
    feedbackCommand({ draftPath: draft, cwd: dir }),
  );

  assert.equal(result, EXIT_CODES.FEEDBACK_BLOCKED);
  assert.match(output, /possível segredo na linha \d+ \(token GitHub\)/);
});

test("frontmatter ausente ou incompleto é bloqueado", async () => {
  const dir = makeChild();
  const file = path.join(dir, "draft.md");
  writeFileSync(file, "## What\nsem frontmatter\n", "utf8");
  const missing = await captureOutput("stderr", () => feedbackCommand({ draftPath: file, cwd: dir }));
  assert.equal(missing.result, EXIT_CODES.FEEDBACK_BLOCKED);
  assert.match(missing.output, /frontmatter YAML ausente/);

  const badType = writeDraft(dir, { type: "feature" });
  const typed = await captureOutput("stderr", () => feedbackCommand({ draftPath: badType, cwd: dir }));
  assert.equal(typed.result, EXIT_CODES.FEEDBACK_BLOCKED);
  assert.match(typed.output, /type inválido/);
});

test("no repositório do template o fluxo aponta para PR + tag", async () => {
  const dir = makeChild({ withAnswers: false, withLock: false });
  writeFileSync(path.join(dir, "TEMPLATE.md"), "# platform-template\n", "utf8");
  const { result, output } = await captureOutput("stderr", () =>
    feedbackCommand({ draftPath: "x.md", cwd: dir }),
  );

  assert.equal(result, EXIT_CODES.USAGE_ERROR);
  assert.match(output, /repositório do template/);
});

test("sem rascunho: usage", async () => {
  const dir = makeChild();
  const { result, output } = await captureOutput("stderr", () => feedbackCommand({ cwd: dir }));
  assert.equal(result, EXIT_CODES.USAGE_ERROR);
  assert.match(output, /uso: pnpm platform feedback/);
});

test("classifyPath espelha a tabela de ownership", () => {
  const lock = new Set(["tag"]);
  assert.equal(classifyPath("apps/api/src/shared/tx/tx.ts", lock).ok, true);
  assert.equal(classifyPath("docs/arch/back.md", lock).ok, true);
  assert.equal(classifyPath("docs/adr/0003-decisao.md", lock).ok, false);
  assert.equal(classifyPath("README.md", lock).ok, false);
  assert.equal(classifyPath("apps/api/drizzle/migrations/0001_kernel_outbox_notify.sql", lock).ok, true);
  assert.equal(classifyPath("apps/api/drizzle/migrations/1000_bookings.sql", lock).ok, false);
  assert.equal(classifyPath("apps/web/src/entities/tag/react/use-tags.ts", lock).ok, true);
  assert.equal(classifyPath(".specs/features/x/spec.md", lock).ok, false);
});

test("githubRepoOf entende gh:, https e git@", () => {
  assert.equal(githubRepoOf("gh:acme/platform-template"), "acme/platform-template");
  assert.equal(githubRepoOf("https://github.com/acme/platform-template.git"), "acme/platform-template");
  assert.equal(githubRepoOf("git@github.com:acme/platform-template.git"), "acme/platform-template");
  assert.equal(githubRepoOf("/um/caminho/local"), undefined);
});
