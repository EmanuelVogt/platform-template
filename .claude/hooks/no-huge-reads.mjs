#!/usr/bin/env node
// PreToolUse(Read|Bash): blocks reading a huge file in full. Measured in
// docs/agents/harness.md: one read of openapi.json costs ~255k tokens, more
// than the peak of a whole session, and keeps being repaid on every following
// turn. The guard is by size, not by list: it also catches a lockfile, a new
// snapshot and a fixture nobody foresaw. Reading a range (offset/limit) is
// still free.
// Harness tooling — not app code.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const LIMIT_BYTES = 100_000;
const MAX_LINES = 400;

let data;
try {
  data = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = data.cwd || process.cwd();
const size = (p) => {
  try {
    const s = statSync(p);
    return s.isFile() ? s.size : 0;
  } catch {
    return 0;
  }
};

const tokens = (bytes) => `~${Math.round(bytes / 3.6 / 1000)}k tokens`;

const alternative = (rel) => {
  if (/(^|\/)openapi\.json$/.test(rel))
    return `  • what changed in the contract → pnpm contract:diff
  • who consumes an operationId → pnpm contract:consumers <operationId>
  • a specific schema → grep -n '"SchemaName"' openapi.json`;
  if (/api-client\/generated\/index\.ts$/.test(rel))
    return `  • it is the barrel of the generated client; import from the file that defines the symbol
  • find the file → grep -rl "<hookName>" packages/api-client/generated`;
  if (/drizzle\/migrations\/meta\/.*_snapshot\.json$/.test(rel))
    return `  • a drizzle snapshot is not to be read: what decides is the migration SQL
    in apps/api/drizzle/migrations/ and the table in src/modules/*/infrastructure/tables`;
  if (/(^|\/)(pnpm-lock\.yaml|package-lock\.json)$/.test(rel))
    return `  • the version of a package → grep -A2 "'<package>@" pnpm-lock.yaml`;
  if (/\.tsbuildinfo$/.test(rel)) return `  • tsc build artifact; it has no information for you`;
  return `  • grep -n to find the line, then Read with offset/limit around it
  • if the question is "what exists here", delegate to the repo-scout subagent`;
};

const block = (abs, extra) => {
  const rel = path.relative(cwd, abs) || abs;
  process.stderr.write(
    `Full read blocked — ${rel} has ${Math.round(size(abs) / 1000)}k chars (${tokens(size(abs))}).

This enters the context and is repaid on every turn until the end of the session. Cheap paths:
${alternative(rel)}
${extra}
`,
  );
  process.exit(2);
};

if (data.tool_name === 'Read') {
  const target = data.tool_input?.file_path;
  if (typeof target !== 'string') process.exit(0);
  const abs = path.resolve(cwd, target);
  if (size(abs) <= LIMIT_BYTES) process.exit(0);
  const limit = Number(data.tool_input?.limit);
  if (Number.isFinite(limit) && limit > 0 && limit <= MAX_LINES) process.exit(0);
  block(
    abs,
    `\nIf you really need this file, use Read with limit <= ${MAX_LINES} and the offset of the line that matters.`,
  );
}

if (data.tool_name === 'Bash') {
  const command = data.tool_input?.command;
  if (typeof command !== 'string') process.exit(0);

  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const segTokens = segment.trim().split(/\s+/).filter(Boolean);
    if (segTokens.length === 0) continue;
    const cmd = path.basename(segTokens[0] === 'rtk' ? (segTokens[1] ?? '') : segTokens[0]);
    if (!['cat', 'less', 'more', 'bat', 'read'].includes(cmd)) continue;
    for (const arg of segTokens.slice(1)) {
      if (arg.startsWith('-')) continue;
      const abs = path.resolve(cwd, arg.replace(/^["']|["']$/g, ''));
      if (size(abs) > LIMIT_BYTES)
        block(abs, `\nTo see a slice: grep -n, head -50 or sed -n '100,200p'.`);
    }
  }
}

process.exit(0);
