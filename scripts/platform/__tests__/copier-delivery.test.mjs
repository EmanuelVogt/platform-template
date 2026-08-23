import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

// Reuses the copier-answers-leak.test.mjs approach: parse the real copier.yml and assert
// on its _exclude list, both directions — a workflow that only makes sense inside the
// template must not leak to the child, and one the child needs must not get swept away
// by a careless edit to the same list.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const excludes = () => parseYaml(readFileSync(path.join(ROOT, "copier.yml"), "utf8"))._exclude ?? [];

test("release.yml is excluded — template-only, tags this repo, never ships to the child", () => {
  assert.ok(
    excludes().includes(".github/workflows/release.yml"),
    "copier.yml must exclude .github/workflows/release.yml next to catalog.yml — it only makes sense in the template repo",
  );
});

// Absence, not exclusion: a _exclude entry for a file that does not exist proves nothing
// and rots. The child never updates itself (owner decision, 2026-08-23).
test("no self-updating bot ships to the child — the bot files do not exist", () => {
  const tracked = execFileSync(
    "git",
    ["ls-files", "-z", ".github/workflows/template-update.yml", "scripts/platform/template-update-ci.mjs"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  assert.deepEqual(
    tracked,
    [],
    "a product must not open its own update PR on a schedule — running the check is the operator's act",
  );
});

test("docs/dev/template-update.md ships to the child (not excluded)", () => {
  assert.ok(
    !excludes().includes("docs/dev/template-update.md"),
    "copier.yml must NOT exclude docs/dev/template-update.md — the two-sided update contract is the child's handbook",
  );
});

test("scripts/platform/migrations ships to the child (no tracked file excluded)", () => {
  const tracked = execFileSync("git", ["ls-files", "-z", "scripts/platform/migrations"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  assert.ok(tracked.length > 0, "expected tracked files under scripts/platform/migrations by wave 2");
  const list = excludes();
  for (const file of tracked) {
    assert.ok(!list.includes(file), `${file} must not be in copier _exclude — migrations ship to the child`);
  }
  assert.ok(!list.includes("scripts/platform/migrations"), "the whole migrations dir must not be excluded");
  assert.ok(!list.includes("/scripts/platform/migrations"), "the whole migrations dir must not be excluded");
});
