#!/usr/bin/env node
// SessionStart + UserPromptSubmit (first prompt only): tells the agent when the
// template this product was generated from has stable tags newer than
// `.copier-answers.yml`'s `_commit`, pointing at the `template-update` skill.
// One `git ls-remote` per 24h per machine (tmpdir cache), 8s timeout, silent
// offline. Exits 0 without output in the template repository itself, which has
// no `.copier-answers.yml`. Harness tooling — not app code.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cachedRemoteStableTags,
  computeTemplateStatus,
  readTemplateOrigin,
} from "../../scripts/platform/lib/template-version.mjs";

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const sessionId = input.session_id;
  const hookEventName = input.hook_event_name;
  if (!sessionId) process.exit(0);

  if (hookEventName === "UserPromptSubmit") {
    const stateFile = join(tmpdir(), `platform-template-behind-${sessionId}`);
    if (existsSync(stateFile)) process.exit(0);
    writeFileSync(stateFile, "1");
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const origin = readTemplateOrigin(join(projectDir, ".copier-answers.yml"));
  if (!origin) process.exit(0);

  const cacheKey = createHash("sha1").update(origin.source).digest("hex").slice(0, 12);
  const tags = cachedRemoteStableTags(origin.source, {
    cachePath: join(tmpdir(), `platform-template-tags-${cacheKey}.json`),
  });
  const status = computeTemplateStatus({ commit: origin.commit, tags });
  if (!status.installed || status.behind.length === 0) process.exit(0);

  const ahead = status.aheadBy > 0 ? ` (installed from a commit ${status.aheadBy} past that tag)` : "";
  const lines = [
    `template behind: installed ${status.installed}${ahead}, latest ${status.latest} — ${status.behind.length} tag(s): ${status.behind.join(", ")}`,
    "run the template-update skill (pnpm platform status for the full picture)",
  ];

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName, additionalContext: lines.join("\n") },
    }),
  );
} catch {
  // A context hook must never break the prompt or the session start: any failure exits silently.
}
process.exit(0);
