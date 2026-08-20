import { existsSync, readFileSync, writeFileSync } from "node:fs";
import semver from "semver";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const CHANGELOG_HEADING = /^## v(\d+\.\d+\.\d+)\s*$/gm;

export class ChangelogVersionMissingError extends Error {
  constructor() {
    super('nenhuma seção "## vX.Y.Z" encontrada em docs/dev/template-changelog.md');
    this.name = "ChangelogVersionMissingError";
  }
}

export function readLatestChangelogVersion(changelogPath) {
  let text;
  try {
    text = readFileSync(changelogPath, "utf8");
  } catch {
    throw new ChangelogVersionMissingError();
  }
  const versions = [...text.matchAll(CHANGELOG_HEADING)].map((match) => match[1]);
  if (versions.length === 0) throw new ChangelogVersionMissingError();
  return versions.reduce((latest, version) => (semver.gt(version, latest) ? version : latest));
}

export function writeSimulatedKernelVersion({ answersPath, kernelVersion }) {
  if (!existsSync(answersPath)) return false;
  const answers = parseYaml(readFileSync(answersPath, "utf8")) ?? {};
  answers._commit = `v${kernelVersion}`;
  writeFileSync(answersPath, stringifyYaml(answers));
  return true;
}
