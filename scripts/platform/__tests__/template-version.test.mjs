import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readTemplateVersion } from "../lib/commands/add.mjs";
import { collectStatus } from "../lib/commands/status.mjs";
import {
  buildTemplateBehindReport,
  cachedRemoteStableTags,
  compareSemver,
  computeTemplateStatus,
  formatTemplateStatus,
  listRemoteStableTags,
  parseInstalledVersion,
  readTemplateOrigin,
  stableTagsFromLsRemote,
  TemplateUnreachableError,
} from "../lib/template-version.mjs";

const LS_REMOTE = [
  "aaaa\trefs/tags/v1.2.0",
  "bbbb\trefs/tags/v2.0.0",
  "cccc\trefs/tags/v10.0.0",
  "dddd\trefs/tags/v2.1.0-rc.1",
  "eeee\trefs/tags/catalog/notification@1.0.0",
  "ffff\trefs/tags/v2.1.0",
  "",
].join("\n");

test("stableTagsFromLsRemote keeps only vX.Y.Z tags, sorted numerically", () => {
  assert.deepEqual(stableTagsFromLsRemote(LS_REMOTE), ["v1.2.0", "v2.0.0", "v2.1.0", "v10.0.0"]);
});

test("compareSemver orders by number, not by string", () => {
  assert.ok(compareSemver("v10.0.0", "v2.0.0") > 0);
  assert.equal(compareSemver("v2.0.0", "v2.0.0"), 0);
  assert.throws(() => compareSemver("2.0", "v2.0.0"), TypeError);
});

test("parseInstalledVersion reads a tag and a describe past the tag", () => {
  assert.deepEqual(parseInstalledVersion("v2.0.0"), { version: "v2.0.0", aheadBy: 0 });
  assert.deepEqual(parseInstalledVersion("v2.0.0-3-gabc1234"), { version: "v2.0.0", aheadBy: 3 });
  assert.equal(parseInstalledVersion("abc1234"), undefined);
  assert.equal(parseInstalledVersion(undefined), undefined);
});

test("computeTemplateStatus lists the tags after the installed one", () => {
  const tags = ["v1.2.0", "v2.0.0", "v2.1.0", "v10.0.0"];
  assert.deepEqual(computeTemplateStatus({ commit: "v2.0.0", tags }), {
    installed: "v2.0.0",
    aheadBy: 0,
    latest: "v10.0.0",
    behind: ["v2.1.0", "v10.0.0"],
  });
  assert.deepEqual(computeTemplateStatus({ commit: "v10.0.0", tags }).behind, []);
  assert.equal(computeTemplateStatus({ commit: "deadbeef", tags }).installed, undefined);
  assert.equal(computeTemplateStatus({ commit: "v2.0.0", tags: [] }).latest, undefined);
});

test("formatTemplateStatus states up to date, behind, or unknown", () => {
  const source = "gh:acme/platform-template";
  assert.equal(
    formatTemplateStatus(source, computeTemplateStatus({ commit: "v2.0.0", tags: ["v2.0.0"] })),
    `template: ${source} installed=v2.0.0 latest=v2.0.0 — atualizado`,
  );
  assert.match(
    formatTemplateStatus(source, computeTemplateStatus({ commit: "v2.0.0-2-gabc", tags: ["v2.0.0", "v2.1.0"] })),
    /installed=v2\.0\.0\+2 latest=v2\.1\.0 — 1 versão\(ões\) atrás: v2\.1\.0$/,
  );
  assert.match(formatTemplateStatus(source, computeTemplateStatus({ commit: "v2.0.0", tags: [] })), /latest=\(desconhecida\)$/);
});

test("buildTemplateBehindReport keeps the behind message alone when there is no pending kernel advisory (FEED-02)", () => {
  const status = { installed: "v2.0.0", aheadBy: 0, latest: "v2.1.0", behind: ["v2.1.0"] };
  const report = buildTemplateBehindReport({ status, pendingKernelAdvisories: [] });
  assert.equal(
    report,
    "template behind: installed v2.0.0, latest v2.1.0 — 1 tag(s): v2.1.0\n" +
      "run the template-update skill (pnpm platform status for the full picture)",
  );
});

test("buildTemplateBehindReport appends one line per pending kernel advisory, first fix line only (FEED-02)", () => {
  const status = { installed: "v2.0.0", aheadBy: 2, latest: "v2.1.0", behind: ["v2.1.0"] };
  const report = buildTemplateBehindReport({
    status,
    pendingKernelAdvisories: [
      { id: "ADV-20260823-01", kind: "bug", severity: "high", fix: "copier update to >= v2.1.0\nmore detail" },
    ],
  });
  const lines = report.split("\n");
  assert.equal(lines[0], "template behind: installed v2.0.0 (installed from a commit 2 past that tag), latest v2.1.0 — 1 tag(s): v2.1.0");
  assert.equal(lines[2], "ADV-20260823-01 bug high kernel — fix: copier update to >= v2.1.0");
});

test("readTemplateOrigin reads _src_path and _commit from the copier answers", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "template-version-"));
  const answersPath = path.join(dir, ".copier-answers.yml");
  assert.equal(readTemplateOrigin(answersPath), undefined);
  writeFileSync(answersPath, "_commit: v2.0.0\n_src_path: gh:acme/platform-template\nproject_name: Demo\n");
  assert.deepEqual(readTemplateOrigin(answersPath), { source: "gh:acme/platform-template", commit: "v2.0.0" });
});

test("listRemoteStableTags expands the gh: shorthand and wraps failures", () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, args]);
    return LS_REMOTE;
  };
  const tags = listRemoteStableTags("gh:acme/platform-template", { exec });
  assert.deepEqual(tags, ["v1.2.0", "v2.0.0", "v2.1.0", "v10.0.0"]);
  assert.deepEqual(calls[0], [
    "git",
    ["ls-remote", "--tags", "--refs", "https://github.com/acme/platform-template.git", "v*"],
  ]);
  assert.throws(
    () =>
      listRemoteStableTags("gh:acme/platform-template", {
        exec: () => {
          throw new Error("timeout");
        },
      }),
    TemplateUnreachableError,
  );
});

test("cachedRemoteStableTags hits the network once per TTL and per source", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "template-version-cache-"));
  const cachePath = path.join(dir, "tags.json");
  let fetches = 0;
  const fetchTags = () => {
    fetches += 1;
    return ["v2.0.0", "v2.1.0"];
  };
  const first = cachedRemoteStableTags("gh:acme/t", { cachePath, now: 1_000, fetchTags });
  const second = cachedRemoteStableTags("gh:acme/t", { cachePath, now: 2_000, ttlMs: 10_000, fetchTags });
  assert.deepEqual(first, second);
  assert.equal(fetches, 1);
  assert.equal(JSON.parse(readFileSync(cachePath, "utf8")).source, "gh:acme/t");

  cachedRemoteStableTags("gh:acme/t", { cachePath, now: 20_000, ttlMs: 10_000, fetchTags });
  assert.equal(fetches, 2, "expired cache is refreshed");
  cachedRemoteStableTags("gh:other/t", { cachePath, now: 20_001, ttlMs: 10_000, fetchTags });
  assert.equal(fetches, 3, "another source never reads a foreign cache");

  writeFileSync(cachePath, "{not json");
  cachedRemoteStableTags("gh:acme/t", { cachePath, now: 20_002, ttlMs: 10_000, fetchTags });
  assert.equal(fetches, 4, "corrupt cache counts as absent");
});

function childFixture({ commit = "v2.0.0", lock, ledger = "" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "template-status-child-"));
  writeFileSync(path.join(dir, ".copier-answers.yml"), `_commit: ${commit}\n_src_path: gh:acme/platform-template\n`);
  mkdirSync(path.join(dir, "docs", "advisories"), { recursive: true });
  writeFileSync(path.join(dir, "docs", "advisories", "APPLIED.md"), ledger);
  writeFileSync(
    path.join(dir, "docs", "advisories", "ADV-20260821-01.md"),
    [
      "---",
      "id: ADV-20260821-01",
      "kind: breaking",
      "module: notification",
      'affects: ">=1.0.0 <2.0.0"',
      "severity: high",
      'detect: "true"',
      'fix: "true"',
      "parity: catalog/notification/parity",
      "---",
      "",
      "body",
      "",
    ].join("\n"),
  );
  if (lock) writeFileSync(path.join(dir, ".platform-modules.lock"), JSON.stringify(lock));
  return dir;
}

test("collectStatus joins template, lock modules and pending advisories", () => {
  const cwd = childFixture({
    lock: { modules: { notification: { version: "1.0.0", catalogRef: "v1.2.0", files: [], migrations: [] } } },
  });
  const status = collectStatus({ cwd, fetchTags: () => ["v1.2.0", "v2.0.0", "v2.1.0"] });
  assert.equal(status.template.source, "gh:acme/platform-template");
  assert.deepEqual(status.template.behind, ["v2.1.0"]);
  assert.deepEqual(status.modules, [{ name: "notification", version: "1.0.0" }]);
  assert.equal(status.advisories.noLock, false);
  assert.deepEqual(
    status.advisories.pending.map((a) => a.id),
    ["ADV-20260821-01"],
  );
});

test("collectStatus survives an unreachable remote and a missing lock", () => {
  const cwd = childFixture();
  const status = collectStatus({
    cwd,
    fetchTags: () => {
      throw new TemplateUnreachableError("gh:acme/platform-template", "offline");
    },
  });
  assert.equal(status.template.installed, "v2.0.0");
  assert.equal(status.template.latest, undefined);
  assert.match(status.template.error, /offline/);
  assert.equal(status.advisories.noLock, true);

  const offline = collectStatus({ cwd, offline: true, fetchTags: () => assert.fail("must not fetch") });
  assert.deepEqual(offline.template.behind, []);
});

test("collectStatus outside a generated product reports the missing answers file", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "template-status-noanswers-"));
  const status = collectStatus({ cwd, fetchTags: () => assert.fail("must not fetch") });
  assert.equal(status.template.source, undefined);
  assert.match(status.template.error, /copier-answers/);
});

function answersFixture(body) {
  const dir = mkdtempSync(path.join(tmpdir(), "read-template-version-"));
  if (body !== undefined) writeFileSync(path.join(dir, ".copier-answers.yml"), body);
  return dir;
}

test("readTemplateVersion resolves a plain tag to its bare semver", () => {
  const cwd = answersFixture("_commit: v2.2.1\n_src_path: gh:acme/platform-template\n");
  assert.equal(readTemplateVersion(cwd), "2.2.1");
});

test("readTemplateVersion resolves a describe-style (off-tag) _commit to the base tag, through parseInstalledVersion (TOOL-03)", () => {
  const cwd = answersFixture("_commit: v2.2.1-4-gabc1234\n_src_path: gh:acme/platform-template\n");
  assert.equal(readTemplateVersion(cwd), "2.2.1");
});

test("readTemplateVersion returns undefined for a dirty ref it cannot parse, instead of a garbage semver", () => {
  const cwd = answersFixture("_commit: v2.2.1-4-gabc1234-dirty\n_src_path: gh:acme/platform-template\n");
  assert.equal(readTemplateVersion(cwd), undefined);
});

test("readTemplateVersion returns undefined when _commit is absent from the answers file", () => {
  const cwd = answersFixture("_src_path: gh:acme/platform-template\n");
  assert.equal(readTemplateVersion(cwd), undefined);
});

test("readTemplateVersion returns undefined for a non-semver _commit", () => {
  const cwd = answersFixture("_commit: abc1234\n_src_path: gh:acme/platform-template\n");
  assert.equal(readTemplateVersion(cwd), undefined);
});
