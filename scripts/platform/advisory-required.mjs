import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { EXIT_CODES } from "./lib/exit-codes.mjs";
import { parseAdvisory } from "./lib/frontmatter.mjs";

const CODE_PATH_RE = /^catalog\/((?:[^/]+\/)?[^/]+)\/(api|web|migrations|parity)\//;
const ADVISORY_PATH_RE = /^docs\/advisories\/ADV-.*\.md$/;
const TRAILER_RE = /^Advisory: none — .+$/m;

function touchedEntries(stagedFiles) {
  const entries = new Set();
  for (const file of stagedFiles) {
    const match = CODE_PATH_RE.exec(file);
    if (match) entries.add(match[1]);
  }
  return entries;
}

export function checkAdvisoryRequired({ stagedFiles, commitMessage, stagedAdvisories }) {
  const entries = touchedEntries(stagedFiles);
  if (entries.size === 0) {
    return { ok: true };
  }
  if (TRAILER_RE.test(commitMessage)) {
    return { ok: true };
  }
  const coveredModules = new Set(stagedAdvisories.map((advisory) => advisory.module));
  const missing = [...entries].filter((entry) => !coveredModules.has(entry));
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function readStagedAdvisories(stagedFiles) {
  return stagedFiles
    .filter((file) => ADVISORY_PATH_RE.test(file))
    .flatMap((file) => {
      const content = execFileSync("git", ["show", `:${file}`], { encoding: "utf8" });
      try {
        return [{ path: file, module: parseAdvisory(content, file).module }];
      } catch {
        return [];
      }
    });
}

function getStagedFiles() {
  return execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const commitMessage = readFileSync(process.argv[2], "utf8");
  const stagedFiles = getStagedFiles();
  const result = checkAdvisoryRequired({
    stagedFiles,
    commitMessage,
    stagedAdvisories: readStagedAdvisories(stagedFiles),
  });
  if (!result.ok) {
    process.stderr.write(`advisory obrigatório ausente para: ${result.missing.join(", ")}\n`);
    process.exit(EXIT_CODES.ADVISORY_INVALID);
  }
  process.exit(EXIT_CODES.OK);
}
