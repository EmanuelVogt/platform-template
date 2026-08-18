#!/usr/bin/env node
// PreToolUse(Bash|Grep|Glob|Read) + UserPromptSubmit(reset): forces the main
// agent to delegate navigation and heavy commands to a subagent (the tier is
// chosen by whoever dispatches — subagent-model-required.mjs demands the
// `model`).
// Measured in docs/agents/harness.md: 87% of all shell output is navigation
// (968 direct calls against 52 delegations), and every character that lands in
// the main context is repaid on every turn until the end of the session. It
// applies to the main agent and to the subagents that also delegate
// (ENFORCED_AGENTS: spec-worker and spec-verifier from tlc-spec-driven, which
// nest repo-scout and shell-runner); inside the other subagents (agent_id
// present, type outside the list) it exits silently, otherwise it would block
// repo-scout itself.
//
// Free quota per user turn: NAV_FREE_PER_TURN quick navigations (one `ls`, one
// `grep -n` in a known file) pass; from there on, delegate. Inside an enforced
// subagent there is no user turn — the quota is for the agent's lifetime
// (NAV_FREE_PER_AGENT, more generous: its context dies in minutes, so the
// repaid cost is small; what is protected there is focus), with its own state
// per agent_id.
// A heavy command (test, typecheck, lint, build) has no quota anywhere: it
// always goes to shell-runner, which returns the exit code and literal failures
// with the log in a file.
// A piped command is classified by its first command only (a filter after a
// pipe like `| tail` or `| head` reduces what enters the context, it isn't
// navigation); the redirect-to-file check still runs on the whole statement.
// A Read counts as one navigation against the same quota when it is a
// whole-file or large read of source (limit absent or > READ_FREE_LINES = 200
// lines); ranged reads and anything under .specs/, .claude/, .agents/, docs/
// or outside the project stay free — no-huge-reads.mjs is the separate hard
// size cap, this is only the delegate-or-not budget.
// Output redirected to a file (`> log`) does not enter the context and passes.
// Escape hatch for debugging the harness itself: PLATFORM_DELEGATE_OFF=1.
// Harness tooling — not app code.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const NAV_FREE_PER_TURN = 2;
const NAV_FREE_PER_AGENT = 6;
const RUN_FREE_PER_TURN = 0;
const READ_FREE_LINES = 200;
const READ_FREE_DIRS = ['.specs', '.claude', '.agents', 'docs'];
const ENFORCED_AGENTS = new Set(['spec-worker', 'spec-verifier']);

const NAV_CMDS = new Set([
  'grep', 'rg', 'find', 'fd', 'ls', 'tree', 'cat', 'head', 'tail', 'sed', 'awk',
  'wc', 'less', 'more', 'bat', 'stat', 'file', 'read',
]);
const RUN_CMDS = new Set(['jest', 'vitest', 'tsc', 'eslint', 'turbo', 'playwright']);
const RUN_PNPM_SCRIPTS = /^(test(:\w+)?|typecheck|check|lint(:\w+)?|build)$/;

const stateFile = (sessionId) => path.join(tmpdir(), `platform-delegate-${sessionId}.json`);
const readState = (sessionId) => {
  try {
    return JSON.parse(readFileSync(stateFile(sessionId), 'utf8'));
  } catch {
    return { nav: 0, run: 0 };
  }
};
const writeState = (sessionId, state) => {
  try {
    writeFileSync(stateFile(sessionId), JSON.stringify(state));
  } catch {
    // state is only the quota; without it the hook keeps working turn by turn
  }
};

let data;
try {
  data = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const baseSessionId = data.session_id ?? 'no-session';

if (process.argv[2] === 'reset' || data.hook_event_name === 'UserPromptSubmit') {
  writeState(baseSessionId, { nav: 0, run: 0 });
  process.exit(0);
}

if (process.env.PLATFORM_DELEGATE_OFF === '1') process.exit(0);
if (data.agent_id && !ENFORCED_AGENTS.has(data.agent_type)) process.exit(0);

// enforced subagent: its own quota, for the agent's lifetime (no per-turn reset)
const sessionId = data.agent_id ? `${baseSessionId}-${data.agent_id}` : baseSessionId;

// strips `rtk` (global proxy) and env prefixes like `FOO=bar cmd`
const head = (tokens) => {
  let i = 0;
  while (i < tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[i])) i++;
  if (tokens[i] === 'rtk') i++;
  if (['sudo', 'time', 'nice', 'env'].includes(tokens[i])) i++;
  return { cmd: path.basename(tokens[i] ?? ''), rest: tokens.slice(i + 1) };
};

const redirectsToFile = (seg) => /<<|(^|[^0-9&])>{1,2}(?!&)\s*[^&\s]/.test(seg);

const pnpmScript = (rest) => {
  let i = 0;
  while (i < rest.length) {
    if (rest[i] === '--filter' || rest[i] === '-F' || rest[i] === '-C') i += 2;
    else if (rest[i] === 'run' || rest[i] === 'exec' || rest[i] === 'dlx' || rest[i] === 'npx' || /^-/.test(rest[i])) i++;
    else break;
  }
  return rest[i] ?? '';
};

// A statement is split on &&, ||, ; and newline; the redirect-to-file check
// runs on the whole statement. Within a statement, only the first pipe segment
// is classified — a filter after a pipe (`| tail`, `| head`, `| grep`) reduces
// what enters the context, it doesn't add navigation.
const classify = (command) => {
  for (const statement of command.split(/&&|\|\||;|\n/)) {
    const stmt = statement.trim();
    if (!stmt) continue;
    if (redirectsToFile(stmt)) continue;

    const firstSeg = stmt.split('|')[0].trim();
    const tokens = firstSeg.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const { cmd, rest } = head(tokens);
    if (!cmd) continue;

    if (RUN_CMDS.has(cmd)) return 'run';
    if (cmd === 'npx' && RUN_CMDS.has(path.basename(rest[0] ?? ''))) return 'run';
    if (cmd === 'pnpm') {
      const script = pnpmScript(rest);
      if (RUN_PNPM_SCRIPTS.test(script)) return 'run';
      if (RUN_CMDS.has(script)) return 'run';
      continue;
    }
    if (cmd === 'sed' && rest.some((a) => /^-[a-zA-Z]*i/.test(a))) continue;
    if (NAV_CMDS.has(cmd)) return 'nav';
  }
  return null;
};

// Whole-file source reads are the same door as shell navigation; ranged reads
// and the orchestrator's own artifacts (specs, harness, skills, handbooks) —
// and anything outside the project — stay free.
const isReadFree = (absPath, projectDir) => {
  const rel = path.relative(projectDir, absPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return true;
  return READ_FREE_DIRS.includes(rel.split(path.sep)[0]);
};

const block = (msg) => {
  process.stderr.write(msg);
  process.exit(2);
};

const summarize = (s) => (s.length > 140 ? `${s.slice(0, 140)}…` : s).replace(/\s+/g, ' ');

const tool = data.tool_name;
let kind = null;
let target = '';

if (tool === 'Grep' || tool === 'Glob') {
  kind = 'nav';
  target = `${tool} ${data.tool_input?.pattern ?? ''}`;
} else if (tool === 'Bash') {
  const command = data.tool_input?.command;
  if (typeof command !== 'string') process.exit(0);
  kind = classify(command);
  target = command;
} else if (tool === 'Read') {
  const filePath = data.tool_input?.file_path;
  if (typeof filePath !== 'string') process.exit(0);
  const cwd = data.cwd || process.cwd();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
  const abs = path.resolve(cwd, filePath);
  const limit = Number(data.tool_input?.limit);
  const ranged = Number.isFinite(limit) && limit > 0 && limit <= READ_FREE_LINES;
  if (!ranged && !isReadFree(abs, projectDir)) {
    kind = 'nav';
    target = filePath;
  }
}

if (!kind) process.exit(0);

const state = readState(sessionId);
state[kind] += 1;
writeState(sessionId, state);

if (kind === 'nav') {
  const navFree = data.agent_id ? NAV_FREE_PER_AGENT : NAV_FREE_PER_TURN;
  if (state.nav <= navFree) process.exit(0);
  const scope = data.agent_id ? `in this ${data.agent_type}'s lifetime` : 'in this turn';
  if (tool === 'Read') {
    block(
      `Direct navigation blocked (#${state.nav} ${scope}; ${navFree} free) — \`Read ${summarize(target)}\`.
Whole-file source read: delegate — Agent(subagent_type: "repo-scout", model: "haiku", prompt: "<where is X / what does Y contain>") returns file:line, then Read the range.
Free: Read with limit <= ${READ_FREE_LINES}; anything under .specs/, .claude/, .agents/, docs/.
`,
    );
  }
  block(
    `Direct navigation blocked (#${state.nav} ${scope}; ${navFree} free) — \`${summarize(target)}\`.
Delegate the question, not the command: Agent(subagent_type: "repo-scout", model: "haiku"|"sonnet", prompt: "<where X is defined / who consumes Y / what exists in Z>") — haiku pinpoint, sonnet for a module map (one call). Returns file:line + one sentence.
Known file:line? Read with offset/limit (<= ${READ_FREE_LINES}) is free.
`,
  );
}

if (state.run <= RUN_FREE_PER_TURN) process.exit(0);
block(
  `Heavy command blocked — \`${summarize(target)}\`.
Delegate: Agent(subagent_type: "shell-runner", model: "haiku", prompt: "From <dir>, run \`${summarize(target)}\` and return the result") — returns exit code + literal failures + log path.
`,
);
