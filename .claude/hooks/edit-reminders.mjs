#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STEP_BYTES = 2 * 1024 * 1024;

const REMINDERS = [
  {
    key: "design-system",
    applies: (filePath) => filePath.includes("/apps/web/"),
    text: "Editing apps/web. Follow docs/arch/front.md: design tokens (never hex), the right role for the token, @workspace/ui primitives via deep import, Sentence case in UI text, Lucide icons, no emoji. If you have not read it in this session, read it before styling.",
  },
  {
    key: "comment-policy",
    applies: (filePath) =>
      /[.](ts|tsx|js|jsx|mjs|cjs)$/.test(filePath) &&
      !/([.]d[.]ts$|\/generated\/|\/node_modules\/|\/[.]claude\/|\/[.]agents\/)/.test(filePath),
    text: "Editing code (api/web). docs/code-quality.md: comments default to ZERO. Only 4 valid cases — an invariant the type does not capture / an external workaround with a reference / a domain constraint outside the adjacent code / a counterintuitive decision another dev would fix. Boy-scout: in the region you touched, delete pre-existing noise comments (above all AI-generated ones) and re-justify from scratch only what fits one of the 4 cases; scope = the region touched, not the whole file. Forbidden: narrating a step, paraphrasing a symbol, summarizing a block, banners, JSDoc that repeats the signature.",
  },
];

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const filePath = input.tool_input?.file_path ?? "";
  const sessionId = input.session_id;
  if (!filePath || !sessionId) process.exit(0);

  const transcriptSize =
    input.transcript_path && existsSync(input.transcript_path)
      ? statSync(input.transcript_path).size
      : 0;

  const due = REMINDERS.filter((reminder) => {
    if (!reminder.applies(filePath)) return false;
    const stateFile = join(tmpdir(), `platform-reminder-${sessionId}-${reminder.key}`);
    const lastInjectedAt = existsSync(stateFile)
      ? Number(readFileSync(stateFile, "utf8"))
      : NaN;
    if (Number.isFinite(lastInjectedAt) && transcriptSize - lastInjectedAt < STEP_BYTES) {
      return false;
    }
    writeFileSync(stateFile, String(transcriptSize));
    return true;
  });

  if (due.length === 0) process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: due.map((reminder) => reminder.text).join("\n\n"),
      },
    }),
  );
} catch {
  // A context hook must never break the edit: any failure exits silently.
}
process.exit(0);
