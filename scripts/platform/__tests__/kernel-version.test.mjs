import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  ChangelogSectionMissingError,
  ChangelogVersionMissingError,
  lintChildMigrationSteps,
  readChangelogSection,
  readLatestChangelogVersion,
  sectionFirstParagraph,
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

const CHANGELOG_FIXTURE = [
  "# Changelog",
  "",
  "## v2.0.0",
  "",
  "Major rewrite of the kernel entry point.",
  "",
  "### Changes",
  "",
  "1. Everything.",
  "",
  "### Child migration steps",
  "",
  "1. **Read the whole guide by hand** and adapt your fork accordingly.",
  "2. Then reboot.",
  "",
  "## v1.1.0",
  "",
  "Two fixes shipped together, wrapped across\ntwo lines for readability.",
  "",
  "### Changes",
  "",
  "1. Fix A.",
  "2. Fix B.",
  "",
  "### Child migration steps",
  "",
  "1. `copier update` picks up both fixes.",
  "",
  "## v1.0.1",
  "",
  "Patch, no manual steps.",
  "",
  "### Child migration steps",
  "",
  "None — copier update is enough.",
  "",
].join("\n");

function withChangelogFixture(build) {
  return withTmpDir((root) => writeFileSync(path.join(root, "changelog.md"), build ?? CHANGELOG_FIXTURE));
}

test("readChangelogSection slices from its heading to the next '## vX.Y.Z' heading", () => {
  const dir = withChangelogFixture();
  try {
    const section = readChangelogSection(path.join(dir, "changelog.md"), "1.1.0");
    assert.match(section, /^Two fixes shipped together/);
    assert.doesNotMatch(section, /v1\.0\.1/);
    assert.doesNotMatch(section, /v2\.0\.0/);
  } finally {
    cleanup(dir);
  }
});

test("readChangelogSection rejects a version with no matching heading", () => {
  const dir = withChangelogFixture();
  try {
    assert.throws(
      () => readChangelogSection(path.join(dir, "changelog.md"), "9.9.9"),
      (err) => err instanceof ChangelogSectionMissingError && err.version === "9.9.9",
    );
  } finally {
    cleanup(dir);
  }
});

test("sectionFirstParagraph returns the intro block up to the next heading, joining wrapped lines", () => {
  const dir = withChangelogFixture();
  try {
    const section = readChangelogSection(path.join(dir, "changelog.md"), "1.1.0");
    assert.equal(sectionFirstParagraph(section), "Two fixes shipped together, wrapped across\ntwo lines for readability.");
  } finally {
    cleanup(dir);
  }
});

test("lintChildMigrationSteps: a major version passes even with a manual (non-backticked) step", () => {
  const dir = withChangelogFixture();
  try {
    const section = readChangelogSection(path.join(dir, "changelog.md"), "2.0.0");
    assert.deepEqual(lintChildMigrationSteps(section, "2.0.0"), { ok: true });
  } finally {
    cleanup(dir);
  }
});

test("lintChildMigrationSteps: a non-major version with a manual step fails naming the step", () => {
  const dir = withChangelogFixture();
  try {
    const section = readChangelogSection(path.join(dir, "changelog.md"), "2.0.0");
    const result = lintChildMigrationSteps(section, "2.1.0");
    assert.equal(result.ok, false);
    assert.match(result.reason, /passo 1/);
    assert.match(result.reason, /Read the whole guide/);
  } finally {
    cleanup(dir);
  }
});

test("lintChildMigrationSteps: a non-major version with all-backticked steps passes", () => {
  const dir = withChangelogFixture();
  try {
    const section = readChangelogSection(path.join(dir, "changelog.md"), "1.1.0");
    assert.deepEqual(lintChildMigrationSteps(section, "1.1.0"), { ok: true });
  } finally {
    cleanup(dir);
  }
});

test("lintChildMigrationSteps: the sentinel line passes for a non-major version", () => {
  const dir = withChangelogFixture();
  try {
    const section = readChangelogSection(path.join(dir, "changelog.md"), "1.0.1");
    assert.deepEqual(lintChildMigrationSteps(section, "1.0.1"), { ok: true });
  } finally {
    cleanup(dir);
  }
});
