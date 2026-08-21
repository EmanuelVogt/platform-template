import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  ChangelogVersionMissingError,
  readLatestChangelogVersion,
  writeSimulatedKernelVersion,
} from "../lib/kernel-version.mjs";

function withTmpDir(build) {
  const dir = mkdtempSync(path.join(tmpdir(), "kernel-version-fixture-"));
  try {
    build(dir);
    return dir;
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

test("readLatestChangelogVersion picks the highest semver among the '## vX.Y.Z' headings", () => {
  const dir = withTmpDir((root) => {
    writeFileSync(
      path.join(root, "changelog.md"),
      "# Changelog\n\n## v1.0.0\n\ntexto\n\n## v0.2.0\n\ntexto antigo\n",
    );
  });
  try {
    const version = readLatestChangelogVersion(path.join(dir, "changelog.md"));
    assert.equal(version, "1.0.0");
  } finally {
    cleanup(dir);
  }
});

test("readLatestChangelogVersion rejects a changelog with no version heading", () => {
  const dir = withTmpDir((root) => {
    writeFileSync(path.join(root, "changelog.md"), "# Changelog\n\nnada aqui.\n");
  });
  try {
    assert.throws(
      () => readLatestChangelogVersion(path.join(dir, "changelog.md")),
      (err) => err instanceof ChangelogVersionMissingError && !err.message.includes(dir),
    );
  } finally {
    cleanup(dir);
  }
});

test("readLatestChangelogVersion rejects a missing changelog file without leaking the path", () => {
  const missing = path.join(tmpdir(), "kernel-version-does-not-exist", "changelog.md");
  assert.throws(
    () => readLatestChangelogVersion(missing),
    (err) => err instanceof ChangelogVersionMissingError && !err.message.includes(missing),
  );
});

test("writeSimulatedKernelVersion overwrites _commit and keeps the other answers intact", () => {
  const dir = withTmpDir((root) => {
    writeFileSync(
      path.join(root, ".copier-answers.yml"),
      "_src_path: .\n_commit: 0.2.0-90-g450f277\nproject_name: Demo\n",
    );
  });
  try {
    const answersPath = path.join(dir, ".copier-answers.yml");
    const patched = writeSimulatedKernelVersion({ answersPath, kernelVersion: "1.0.0" });
    assert.equal(patched, true);
    const answers = parseYaml(readFileSync(answersPath, "utf8"));
    assert.equal(answers._commit, "v1.0.0");
    assert.equal(answers.project_name, "Demo");
    assert.equal(answers._src_path, ".");
  } finally {
    cleanup(dir);
  }
});

test("writeSimulatedKernelVersion is a no-op when the answers file does not exist", () => {
  const dir = withTmpDir(() => {});
  try {
    const patched = writeSimulatedKernelVersion({
      answersPath: path.join(dir, ".copier-answers.yml"),
      kernelVersion: "1.0.0",
    });
    assert.equal(patched, false);
  } finally {
    cleanup(dir);
  }
});
