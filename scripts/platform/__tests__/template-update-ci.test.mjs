import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listPrTags, planUpdate, runUpdate } from "../template-update-ci.mjs";

function withChangelogFixture(build) {
  const root = mkdtempSync(path.join(tmpdir(), "template-update-ci-fixture-"));
  try {
    build(root);
    return root;
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw err;
  }
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

function writeChangelog(root, version, body) {
  const dir = path.join(root, "docs", "dev");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "template-changelog.md"), `## v${version}\n\n${body}\n`);
}

// Runner falso no mesmo formato de catalog-check.test.mjs: casa por prefixo
// do comando+args e devolve o override, senão sucesso (status 0) por padrão.
function stubRun(overrides = {}) {
  const calls = [];
  const fn = (command, args = []) => {
    const key = [command, ...args].join(" ");
    calls.push(key);
    const match = Object.entries(overrides).find(([pattern]) => key.startsWith(pattern));
    return match ? match[1] : { status: 0, stdout: "", stderr: "" };
  };
  fn.calls = calls;
  return fn;
}

function statusWithBehind(behind) {
  return { template: { behind } };
}

test("planUpdate: no behind tags -> none, up-to-date", () => {
  const plan = planUpdate({ status: statusWithBehind([]) });
  assert.deepEqual(plan, { action: "none", tag: undefined, reason: "up-to-date" });
});

test("planUpdate: behind with an open PR for the first tag -> none, pr-open", () => {
  const plan = planUpdate({ status: statusWithBehind(["v2.3.0", "v2.4.0"]), openPrs: ["v2.3.0"] });
  assert.deepEqual(plan, { action: "none", tag: "v2.3.0", reason: "pr-open" });
});

test("planUpdate: behind with a closed-unmerged PR for the first tag -> none, pr-closed (does not reopen)", () => {
  const plan = planUpdate({ status: statusWithBehind(["v2.3.0"]), closedPrs: ["v2.3.0"] });
  assert.deepEqual(plan, { action: "none", tag: "v2.3.0", reason: "pr-closed" });
});

test("planUpdate: behind, no PR at all -> update targeting the first behind tag", () => {
  const plan = planUpdate({ status: statusWithBehind(["v2.3.0", "v2.4.0"]) });
  assert.deepEqual(plan, { action: "update", tag: "v2.3.0", reason: "behind" });
});

test("runUpdate: green gate, no conflicts -> pushes and opens a PR with the changelog section as body", () => {
  const root = withChangelogFixture((dir) => writeChangelog(dir, "2.3.0", "Bumps the kernel."));
  try {
    const run = stubRun({ "git grep": { status: 1, stdout: "", stderr: "" } });
    const result = runUpdate({ tag: "v2.3.0", run, repoRoot: root });
    assert.deepEqual(result, { outcome: "pr", tag: "v2.3.0" });
    assert.deepEqual(run.calls, [
      "git checkout -b chore/template-update-v2.3.0",
      "git config user.name github-actions[bot]",
      "git config user.email github-actions[bot]@users.noreply.github.com",
      "copier update --trust --vcs-ref v2.3.0",
      "git grep -l -e <<<<<<< before updating -e >>>>>>> after updating",
      "pnpm platform template migrate",
      "pnpm install",
      "pnpm check",
      "pnpm test",
      "git add -A",
      "git commit -m chore(template): update to v2.3.0",
      "git push --set-upstream origin chore/template-update-v2.3.0",
      "gh pr create --title chore(template): update to v2.3.0 --body Bumps the kernel. --head chore/template-update-v2.3.0",
    ]);
  } finally {
    cleanup(root);
  }
});

test("runUpdate: copier reports a conflict -> issue opened, no push, no PR, no gate steps run", () => {
  const run = stubRun({
    "git grep": { status: 0, stdout: "shared/foo.ts\n", stderr: "" },
    "gh issue list": { status: 0, stdout: "[]", stderr: "" },
  });
  const result = runUpdate({ tag: "v2.3.0", run });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.reason, "conflict");
  assert.deepEqual(result.conflicts, ["shared/foo.ts"]);
  assert.ok(run.calls.some((c) => c.startsWith("gh issue create") && c.includes("shared/foo.ts")));
  assert.ok(!run.calls.some((c) => c.startsWith("git push")));
  assert.ok(!run.calls.some((c) => c.startsWith("gh pr create")));
  assert.ok(!run.calls.some((c) => c.startsWith("pnpm")));
});

test("runUpdate: red gate (pnpm check fails) -> issue with the failing step's tail, no push, no PR", () => {
  const run = stubRun({
    "git grep": { status: 1, stdout: "", stderr: "" },
    "pnpm check": { status: 1, stdout: "", stderr: "FAIL apps/api/foo.test.ts\nexpected true, got false\n" },
    "gh issue list": { status: 0, stdout: "[]", stderr: "" },
  });
  const result = runUpdate({ tag: "v2.3.0", run });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.reason, "gate");
  assert.equal(result.step, "pnpm check");
  const issueCreate = run.calls.find((c) => c.startsWith("gh issue create"));
  assert.ok(issueCreate.includes("expected true, got false"));
  assert.ok(!run.calls.some((c) => c.startsWith("pnpm test")));
  assert.ok(!run.calls.some((c) => c.startsWith("git push")));
});

test("runUpdate: an issue already open for the tag -> comments on it instead of duplicating", () => {
  const run = stubRun({
    "git grep": { status: 0, stdout: "shared/foo.ts\n", stderr: "" },
    "gh issue list": {
      status: 0,
      stdout: JSON.stringify([{ number: 42, title: "template update to v2.3.0 blocked" }]),
      stderr: "",
    },
  });
  const result = runUpdate({ tag: "v2.3.0", run });
  assert.equal(result.outcome, "blocked");
  assert.ok(run.calls.some((c) => c.startsWith("gh issue comment 42")));
  assert.ok(!run.calls.some((c) => c.startsWith("gh issue create")));
});

test("runUpdate: copier update itself fails (origin unreachable/auth) -> unreachable outcome, hints TEMPLATE_READ_TOKEN, no later steps", () => {
  const run = stubRun({ copier: { status: 1, stdout: "", stderr: "fatal: could not read Username" } });
  const logs = [];
  const result = runUpdate({ tag: "v2.3.0", run, log: (line) => logs.push(line) });
  assert.deepEqual(result, { outcome: "unreachable", tag: "v2.3.0" });
  assert.ok(logs.some((line) => line.includes("TEMPLATE_READ_TOKEN")));
  assert.ok(!run.calls.some((c) => c.startsWith("git grep")));
  assert.ok(!run.calls.some((c) => c.startsWith("pnpm")));
});

test("listPrTags: closed state excludes merged PRs, extracts the tag from the branch name", () => {
  const run = stubRun({
    "gh pr list --state closed": {
      status: 0,
      stdout: JSON.stringify([
        { headRefName: "chore/template-update-v2.2.0", mergedAt: "2026-01-01T00:00:00Z" },
        { headRefName: "chore/template-update-v2.3.0", mergedAt: null },
      ]),
      stderr: "",
    },
  });
  assert.deepEqual(listPrTags({ run, state: "closed" }), ["v2.3.0"]);
});
