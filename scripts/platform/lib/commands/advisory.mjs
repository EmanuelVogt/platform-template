import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadAdvisories } from "../advisories.mjs";
import { EXIT_CODES } from "../exit-codes.mjs";

function defaultRun(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return { status: result.status ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export async function detectCommand({ id, cwd = process.cwd(), run = defaultRun, advisoriesDir }) {
  const dir = advisoriesDir ?? path.join(cwd, "docs/advisories");
  const advisories = loadAdvisories(dir);
  const advisory = advisories.find((entry) => entry.id === id);
  if (!advisory) {
    process.stderr.write(`advisory não encontrado: ${id}\n`);
    return EXIT_CODES.ADVISORY_INVALID;
  }

  const [command, ...args] = advisory.detect.split(" ");
  const result = run(command, args, { cwd });
  const affected = result.status === 1;
  process.stdout.write(`${id}: ${affected ? "afetado" : "não afetado"}\n`);
  return affected ? 1 : EXIT_CODES.OK;
}
