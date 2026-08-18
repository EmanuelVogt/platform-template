#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STEP_BYTES = 2 * 1024 * 1024;

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const transcriptPath = input.transcript_path;
  const sessionId = input.session_id;
  if (!transcriptPath || !sessionId || !existsSync(transcriptPath)) process.exit(0);

  const size = statSync(transcriptPath).size;
  if (size < STEP_BYTES) process.exit(0);

  const stateFile = join(tmpdir(), `platform-tripwires-${sessionId}`);
  const lastInjectedAt = existsSync(stateFile) ? Number(readFileSync(stateFile, "utf8")) || 0 : 0;
  if (size - lastInjectedAt < STEP_BYTES) process.exit(0);
  writeFileSync(stateFile, String(size));

  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const claudeMd = readFileSync(join(projectDir, "CLAUDE.md"), "utf8");
  const tripwires = claudeMd.match(/## Tripwires\n([\s\S]*?)(?:\n## |$)/)?.[1]?.trim();
  if (!tripwires) process.exit(0);

  const context = [
    "Long session: reinforcing the harness instructions (CLAUDE.md Tripwires, read from disk just now).",
    tripwires,
    "In doubt about a rule, reopen the area handbook before editing.",
  ].join("\n\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: context.slice(0, 9000),
      },
    }),
  );
} catch {
  // A context hook must never break the prompt: any failure exits silently.
}
process.exit(0);
