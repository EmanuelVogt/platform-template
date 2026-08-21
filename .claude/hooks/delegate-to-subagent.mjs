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
// `grep -n` in a known file) pass; from there on, delegate. A heavy command
// (test, typecheck, lint, build) has no quota on the main thread: it goes to
// shell-runner, which returns the exit code and literal failures with the log
// in a file.
// Inside an enforced subagent (spec-worker, spec-verifier) neither navigation
// nor heavy runs are counted, decided 2026-08-21: the worker and the Verifier
// run their own scoped gates directly (`cmd > log 2>&1; echo exit=$?`, then
// grep on the log), because 73 of 196 worker→runner dispatches had to be
// escalated to sonnet just to slice a red log — the hop, not the tier, was the
// cost. shell-runner keeps exactly two callers: the orchestrator's Build gate
// and the Verifier's Final gate. What stays enforced inside those agents is the
// Read BYTE budget for the agent's lifetime (READ_BYTES_FREE_PER_AGENT), the
// guard against reading a 30 kB reference whole before the first edit —
// measured the same day, a worker spent a median 21 turns and 94k of context
// warming up.
// A piped command is classified by its first command only (a filter after a
// pipe like `| tail` or `| head` reduces what enters the context, it isn't
// navigation); the redirect-to-file check still runs on the whole statement.
// A Bash statement whose path arguments are ALL under HARNESS_DIRS (.claude/,
// .agents/, docs/agents/, scripts/, .specs/) does not count as navigation: the
// quota exists to push exploration of PRODUCT code to repo-scout, while editing
// the harness itself (hooks, skills, agents, agent docs, scripts, specs) is work
// the main thread does directly. Until 2026-08-21 the way through was the
// `git show HEAD:<path>` form — `git` is not a NAV_CMD — and that loophole is
// what made that day's delegation analysis possible; the exemption states the
// intent instead of leaving it to an accident. A statement with no path argument
// keeps the old behaviour, and a single path outside the list (`cat .claude/x
// apps/y`) makes the whole statement count again. The exemption is for the
// navigation COUNT only — the per-turn Read byte budget below is untouched.
// On the main thread a Read counts as one navigation against the same quota
// when it is a whole-file or large read of source (limit absent or >
// READ_FREE_LINES = 200 lines); ranged reads and anything under .specs/,
// .claude/, .agents/, docs/ or outside the project stay free — no-huge-reads.mjs is the separate hard
// size cap, this is only the delegate-or-not budget.
// Output redirected to a file (`> log`) does not enter the context and passes.
// Every Read also counts BYTES against a budget — READ_BYTES_FREE_PER_TURN on
// the main thread, reset each user turn; READ_BYTES_FREE_PER_AGENT inside an
// enforced subagent, for its whole life — whatever the directory and ranged or
// not; the free-dir exemption above is for the navigation COUNT only. Measured
// 2026-08-20 over the bytes the main window Read after delegating Execute:
// `.specs` 50% (`STATE.md` alone 577 KB over 31 reads), skill references read
// whole 23%, chained ranged reads paging through one file 22%; code 3%. A
// ranged read is priced by the byte length of its lines (files over 2 MB are
// estimated from the average line length of the first 2 MB); a whole read by
// the file size. Over budget, the read is blocked with the cheap path.
// Escape hatch for debugging the harness itself: PLATFORM_DELEGATE_OFF=1.
// Harness tooling — not app code.
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const NAV_FREE_PER_TURN = 2;
const RUN_FREE_PER_TURN = 0;
const READ_FREE_LINES = 200;
const READ_BYTES_FREE_PER_TURN = 48_000;
const READ_BYTES_FREE_PER_AGENT = 120_000;
const READ_SCAN_CAP = 2 * 1024 * 1024;
const READ_FREE_DIRS = ['.specs', '.claude', '.agents', 'docs'];
const HARNESS_DIRS = ['.claude', '.agents', 'docs/agents', 'scripts', '.specs'];
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
    return { nav: 0, run: 0, readBytes: 0 };
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
const cwd = data.cwd || process.cwd();
const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;

if (process.argv[2] === 'reset' || data.hook_event_name === 'UserPromptSubmit') {
  writeState(baseSessionId, { nav: 0, run: 0, readBytes: 0 });
  process.exit(0);
}

if (process.env.PLATFORM_DELEGATE_OFF === '1') process.exit(0);
if (data.agent_id && !ENFORCED_AGENTS.has(data.agent_type)) process.exit(0);

// enforced subagent: its own byte budget, for the agent's lifetime (no per-turn reset)
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

// path-like arguments of a segment: a token with a `/`, or a dotted name that
// exists on disk (`ls .claude`); `git show HEAD:<path>` keeps only the path.
// A pattern that happens to look like a path (`grep 'a/b'`) is counted as one —
// the error falls on the safe side, which is the quota staying in force.
const pathArgs = (rest) =>
  rest
    .map((token) => token.replace(/^['"]|['"]$/g, ''))
    .filter((token) => token && !token.startsWith('-'))
    .map((token) => {
      const colon = token.indexOf(':');
      const suffix = colon > 0 ? token.slice(colon + 1) : '';
      return suffix.includes('/') || suffix.startsWith('.') ? suffix : token;
    })
    .filter((token) => token.includes('/') || (token.startsWith('.') && existsSync(path.resolve(cwd, token))));

// repo-relative form of a path argument; '' when it points outside the repo
const repoRel = (token) => {
  const rel = path.relative(projectDir, path.resolve(cwd, token));
  return !rel || rel.startsWith('..') || path.isAbsolute(rel) ? '' : rel;
};

// every path argument under HARNESS_DIRS, and there is at least one
const harnessScoped = (rest) => {
  const args = pathArgs(rest);
  if (args.length === 0) return false;
  return args.every((token) => {
    const rel = repoRel(token);
    return rel !== '' && HARNESS_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
  });
};

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
// what enters the context, it doesn't add navigation. A navigation statement
// scoped to HARNESS_DIRS is skipped, so a compound command only counts when at
// least one of its statements navigates outside the harness.
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
    if (NAV_CMDS.has(cmd)) {
      if (harnessScoped(rest)) continue;
      return 'nav';
    }
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

const readHead = (abs, length) => {
  const buffer = Buffer.alloc(length);
  const fd = openSync(abs, 'r');
  try {
    return buffer.subarray(0, readSync(fd, buffer, 0, length, 0));
  } finally {
    closeSync(fd);
  }
};

// bytes the Read tool will return: the ranged lines, else the whole file
const readBytesOf = (abs, offset, limit) => {
  let size;
  try {
    size = statSync(abs).size;
  } catch {
    return 0;
  }
  if (!Number.isFinite(limit) || limit <= 0) return size;
  const start = Number.isFinite(offset) && offset > 1 ? Math.floor(offset) : 1;
  let head;
  try {
    head = readHead(abs, Math.min(size, READ_SCAN_CAP));
  } catch {
    return size;
  }
  const lines = head.toString('utf8').split('\n');
  if (size <= READ_SCAN_CAP) return Buffer.byteLength(lines.slice(start - 1, start - 1 + limit).join('\n'));
  return Math.min(size, Math.round((head.length / Math.max(1, lines.length - 1)) * limit));
};

const kb = (n) => (n / 1000).toFixed(1);

const block = (msg) => {
  process.stderr.write(msg);
  process.exit(2);
};

const summarize = (s) => (s.length > 140 ? `${s.slice(0, 140)}…` : s).replace(/\s+/g, ' ');

const tool = data.tool_name;
let kind = null;
let target = '';
let pendingReadBytes = 0;

// bytes are charged only for a read that passes: a blocked read never lands
const commitReadBytes = () => {
  if (!pendingReadBytes) return;
  const state = readState(sessionId);
  writeState(sessionId, { ...state, readBytes: (state.readBytes ?? 0) + pendingReadBytes });
};

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
  const abs = path.resolve(cwd, filePath);
  const limit = Number(data.tool_input?.limit);
  const budget = data.agent_id ? READ_BYTES_FREE_PER_AGENT : READ_BYTES_FREE_PER_TURN;
  const bytes = readBytesOf(abs, Number(data.tool_input?.offset), limit);
  const used = readState(sessionId).readBytes ?? 0;
  if (used + bytes > budget) {
    block(
      `Read budget ${data.agent_id ? `for this ${data.agent_type}` : 'for this turn'} exhausted (${kb(used)} KB of ${kb(budget)} KB; this read adds ${kb(bytes)} KB — \`${filePath}\`).
Paging through a file by ranges is a whole-file read in instalments: ask \`repo-scout\` (sonnet) for the section or the answer and read only the range it names; for \`.specs/STATE.md\` read one section (\`grep -n '^## '\` first); the skill's references have cards (\`references/cards/*.md\`) — read the card, not the reference.
`,
    );
  }
  pendingReadBytes = bytes;
  const ranged = Number.isFinite(limit) && limit > 0 && limit <= READ_FREE_LINES;
  if (!data.agent_id && !ranged && !isReadFree(abs, projectDir)) {
    kind = 'nav';
    target = filePath;
  }
}

if (!kind) {
  commitReadBytes();
  process.exit(0);
}

// Inside an enforced subagent only the Read byte budget above applies: it runs
// its own gates and navigates freely (see the header).
if (data.agent_id) {
  commitReadBytes();
  process.exit(0);
}

const state = readState(sessionId);
state[kind] += 1;
writeState(sessionId, state);

if (kind === 'nav') {
  if (state.nav <= NAV_FREE_PER_TURN) {
    commitReadBytes();
    process.exit(0);
  }
  if (tool === 'Read') {
    block(
      `Direct navigation blocked (#${state.nav} in this turn; ${NAV_FREE_PER_TURN} free) — \`Read ${summarize(target)}\`.
Whole-file source read: delegate — Agent(subagent_type: "repo-scout", model: "haiku", prompt: "<where is X / what does Y contain>") returns file:line, then Read the range.
Free: Read with limit <= ${READ_FREE_LINES}; anything under .specs/, .claude/, .agents/, docs/.
`,
    );
  }
  block(
    `Direct navigation blocked (#${state.nav} in this turn; ${NAV_FREE_PER_TURN} free) — \`${summarize(target)}\`.
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
