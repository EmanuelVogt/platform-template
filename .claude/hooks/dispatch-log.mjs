#!/usr/bin/env node
// PreToolUse(Agent) `dispatch` · SubagentStart `start` · SubagentStop `stop`:
// append-only log of every sub-agent run in this repo — who dispatched what,
// at which tier, in which wave/cluster, and what it cost and returned — so the
// delegation model is measured instead of remembered. Measured 2026-08-20 by
// hand over the transcripts: 24 of 24 `fork` agents spawned by spec-workers
// were "noop" placeholders, 16 of 17 declared multi-cluster waves went out
// across several messages; nothing in the repo could say so without a day of
// jq. `pnpm dispatch:report` (scripts/dispatch-report.mjs) reads this log.
//
// Log: <projectsDir>/dispatch-log.jsonl, where <projectsDir> is the directory
// holding the main transcript `<session_id>.jsonl` (the hook also fires inside
// a subagent, whose transcript_path points under `<session>/subagents/`);
// fallback ~/.claude/platform-dispatch-log.jsonl. A log never blocks a tool:
// every failure exits 0 silently. PLATFORM_DISPATCH_DEBUG=1 also appends the
// raw stdin (prompt truncated) to dispatch-debug.jsonl — the SubagentStart and
// SubagentStop fields are undocumented; `raw_keys` on every start row and the
// debug file confirm them by use. Confirmed live 2026-08-20: SubagentStart
// carries session_id, transcript_path, cwd, prompt_id, agent_id, agent_type;
// SubagentStop adds agent_transcript_path, last_assistant_message,
// stop_hook_active, permission_mode, background_tasks, session_crons. Stop
// events with an empty agent_type and no transcript are Claude Code's own
// helper invocations and are dropped.
// `stop` computes turns, context, output, commits and outcome from the subagent
// transcript (`<projectsDir>/<session>/subagents/agent-<id>.jsonl` + its
// `.meta.json`), deduping assistant rows by message.id (one API call is
// written as several rows). A fork's transcript starts with a verbatim copy of
// its parent's rows: those are skipped by uuid when the parent is on disk and
// small enough to scan, otherwise the row carries inherited_rows_possible.
//
// `dispatch` also enforces, on the main thread only, that a wave is ONE
// message: the Tasks phase authors clusters so that a wave's workers run
// concurrently, and 16 of 17 declared multi-cluster waves were instead
// dispatched one worker at a time, 26–60 min apart (2026-08-20). A spec-worker
// dispatch whose payload names a wave and a cluster is blocked (exit 2, with a
// `wave-split` row in the log) when another cluster of that wave went out more
// than WAVE_SAME_MESSAGE_S ago — unless the label was already dispatched (a
// continuation keeps its label), WAVE_IN_FLIGHT_CAP clusters already went out
// together (the FIFO queue tail), the payload states `serial-ok: <reason>`, or
// a block happened under WAVE_BLOCK_GRACE_S ago (the orchestrator is now
// re-issuing the wave in one message). State per session in the tmpdir.
// Harness tooling — not app code.
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const PARENT_SCAN_CAP = 32 * 1024 * 1024;
const LAST_TEXT_CHARS = 300;
const DEBUG_PROMPT_CHARS = 200;
const WAVE_SAME_MESSAGE_S = 120;
const WAVE_BLOCK_GRACE_S = 180;
const WAVE_IN_FLIGHT_CAP = 4;

const mode = process.argv[2];

const readStdin = () => {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
};

// The nearest ancestor of transcript_path that holds `<session_id>.jsonl`.
const projectsDirOf = (input) => {
  const { transcript_path: transcript, session_id: session } = input;
  if (typeof transcript !== 'string' || typeof session !== 'string') return null;
  let dir = path.dirname(transcript);
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, `${session}.jsonl`))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

const append = (file, row) => {
  try {
    appendFileSync(file, `${JSON.stringify(row)}\n`);
  } catch {
    // a log never blocks a tool
  }
};

const agentIdOf = (input) => {
  const direct = input.agent_id ?? input.agentId;
  if (typeof direct === 'string' && direct) return direct;
  const m = /agent-([^/\\]+)\.jsonl$/.exec(String(input.agent_transcript_path ?? input.transcript_path ?? ''));
  return m ? m[1] : null;
};

const parseWave = (prompt) => {
  const m = /wave\s*(\d+)/i.exec(prompt);
  return m ? Number(m[1]) : null;
};

const parseCluster = (prompt) => {
  const m = /\b[Cc]luster\s+([A-Z][\w-]*)/.exec(prompt) ?? /\b(C\d+)\b/.exec(prompt);
  return m ? m[1] : null;
};

const parseSiblings = (prompt) => {
  const line = /Siblings in flight:\s*([^\n]*)/i.exec(prompt);
  return line ? [...new Set(line[1].match(/\bC\d+\b/g) ?? [])] : [];
};

const dispatchRow = (input) => {
  const toolInput = input.tool_input ?? {};
  const prompt = typeof toolInput.prompt === 'string' ? toolInput.prompt : '';
  return {
    ev: 'dispatch',
    ts: new Date().toISOString(),
    session: input.session_id ?? null,
    parent_agent: input.agent_id ?? null,
    parent_type: input.agent_id ? (input.agent_type ?? 'unknown') : 'main',
    type: toolInput.subagent_type ?? null,
    model: typeof toolInput.model === 'string' ? toolInput.model : null,
    desc: toolInput.description ?? null,
    wave: parseWave(prompt),
    cluster: parseCluster(prompt),
    siblings: parseSiblings(prompt),
    prompt_chars: prompt.length,
    tool_use_id: input.tool_use_id ?? null,
  };
};

const waveStateFile = (session) => path.join(tmpdir(), `platform-wave-${session}.json`);
const readWaveState = (session) => {
  try {
    return JSON.parse(readFileSync(waveStateFile(session), 'utf8'));
  } catch {
    return {};
  }
};
const writeWaveState = (session, state) => {
  try {
    writeFileSync(waveStateFile(session), JSON.stringify(state));
  } catch {
    // without state the rule degrades to allow — a log never blocks a tool
  }
};

// null = allowed (state updated); otherwise the block message and the log row
const waveVerdict = (input, row) => {
  if (input.agent_id || row.type !== 'spec-worker' || row.wave === null || row.cluster === null || !row.session) return null;
  const prompt = String(input.tool_input?.prompt ?? '');
  const now = Date.now();
  const state = readWaveState(row.session);
  const key = String(row.wave);
  const entry = state[key] ?? { first_ts: now, clusters: {}, blocked_at: null };
  const serial = /serial-ok:\s*([^\n]*)/i.exec(prompt);
  const sameMessage = Object.values(entry.clusters).filter((ts) => ts - entry.first_ts <= WAVE_SAME_MESSAGE_S * 1000).length;
  const allowed =
    !state[key] ||
    entry.clusters[row.cluster] !== undefined ||
    now - entry.first_ts <= WAVE_SAME_MESSAGE_S * 1000 ||
    sameMessage >= WAVE_IN_FLIGHT_CAP ||
    serial !== null ||
    (entry.blocked_at !== null && now - entry.blocked_at < WAVE_BLOCK_GRACE_S * 1000);
  if (allowed) {
    entry.clusters[row.cluster] ??= now;
    state[key] = entry;
    writeWaveState(row.session, state);
    if (serial) row.serial_ok = serial[1].trim().slice(0, 200);
    return null;
  }
  entry.blocked_at = now;
  state[key] = entry;
  writeWaveState(row.session, state);
  const ordered = Object.entries(entry.clusters).sort((a, b) => a[1] - b[1]);
  const firstLabel = ordered[0]?.[0] ?? '?';
  const minutes = Math.round((now - entry.first_ts) / 60000);
  const remaining = [row.cluster, ...row.siblings.filter((c) => c !== row.cluster && entry.clusters[c] === undefined)];
  return {
    split: {
      ev: 'wave-split',
      ts: new Date().toISOString(),
      session: row.session,
      wave: row.wave,
      cluster: row.cluster,
      first_cluster: firstLabel,
      minutes_since_first: minutes,
      dispatched: ordered.map(([label]) => label),
    },
    message: `Wave ${row.wave} is being dispatched serially: ${firstLabel} went out ${minutes} min ago, ${row.cluster} only now. A wave is ONE message with one \`Agent\` call per cluster — they run concurrently; one worker at a time forfeits the parallelism the Tasks phase was built for.
Re-issue now: every remaining cluster of wave ${row.wave} (${remaining.join(', ')}) in this single message. A continuation of a STOPPED cluster keeps its label; a re-planned cluster gets the next wave number; a genuinely sequential dispatch states \`serial-ok: <reason>\` in the payload.
`,
  };
};

const startRow = (input) => ({
  ev: 'start',
  ts: new Date().toISOString(),
  session: input.session_id ?? null,
  agent_id: agentIdOf(input),
  type: input.agent_type ?? input.agentType ?? null,
  model: input.model ?? null,
  parent_agent: input.parent_agent_id ?? input.parentAgentId ?? null,
  tool_use_id: input.tool_use_id ?? null,
  raw_keys: Object.keys(input),
});

const findTranscript = (input, projectsDir) => {
  const explicit = input.agent_transcript_path ?? input.agentTranscriptPath;
  if (typeof explicit === 'string' && existsSync(explicit)) return explicit;
  const id = agentIdOf(input);
  if (projectsDir && id && typeof input.session_id === 'string') {
    const candidate = path.join(projectsDir, input.session_id, 'subagents', `agent-${id}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  const own = input.transcript_path;
  if (typeof own === 'string' && /[/\\]subagents[/\\]agent-[^/\\]+\.jsonl$/.test(own) && existsSync(own)) return own;
  return null;
};

const readMeta = (transcriptPath) => {
  try {
    return JSON.parse(readFileSync(transcriptPath.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
  } catch {
    return {};
  }
};

// uuids of the parent's rows, to drop the copy a fork's transcript starts with
const inheritedUuids = (transcriptPath, meta, projectsDir, session) => {
  const parentPath = meta.parentAgentId
    ? path.join(path.dirname(transcriptPath), `agent-${meta.parentAgentId}.jsonl`)
    : projectsDir && session
      ? path.join(projectsDir, `${session}.jsonl`)
      : null;
  try {
    if (!parentPath || statSync(parentPath).size > PARENT_SCAN_CAP) return null;
    const set = new Set();
    for (const m of readFileSync(parentPath, 'utf8').matchAll(/"uuid":"([0-9a-f-]{36})"/g)) set.add(m[1]);
    return set;
  } catch {
    return null;
  }
};

const resultText = (block) => {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) return block.content.map((c) => (typeof c.text === 'string' ? c.text : '')).join('\n');
  return '';
};

// `[branch abc1234] msg` from git itself, `abc1234 msg` on the first line from rtk
const commitHash = (text) => {
  const m = /\[[^\]\s]+ ([0-9a-f]{7,40})\]/.exec(text) ?? /^\s*([0-9a-f]{7,40})\s+\S/.exec(text);
  return m ? m[1] : null;
};

const classifyOutcome = (text) => {
  if (/STOPPED|BLOCKED|could not|FAIL ❌|— FAIL/.test(text)) return 'stopped';
  if (/PASS ✅|— DONE|\bDONE\b/.test(text)) return 'done';
  return 'unknown';
};

const analyse = (transcriptPath, skip) => {
  const turns = new Map();
  const commitCalls = new Set();
  const commits = [];
  let first = null;
  let last = null;
  let model = null;
  let lastText = '';
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (skip && typeof row.uuid === 'string' && skip.has(row.uuid)) continue;
    if (typeof row.timestamp === 'string') {
      first ??= row.timestamp;
      last = row.timestamp;
    }
    const content = Array.isArray(row.message?.content) ? row.message.content : [];
    if (row.type === 'assistant') {
      if (row.message?.id && row.message.usage) turns.set(row.message.id, row.message.usage);
      if (typeof row.message?.model === 'string') model = row.message.model;
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) lastText = block.text;
        if (block.type === 'tool_use' && block.name === 'Bash' && /\bgit\s+commit\b/.test(String(block.input?.command ?? ''))) {
          commitCalls.add(block.id);
        }
      }
    } else if (row.type === 'user') {
      for (const block of content) {
        if (block.type !== 'tool_result' || !commitCalls.has(block.tool_use_id)) continue;
        commitCalls.delete(block.tool_use_id);
        const hash = commitHash(resultText(block));
        if (hash) commits.push(hash);
      }
    }
  }
  let ctx = 0;
  let out = 0;
  let cacheCreate = 0;
  let cacheRead = 0;
  for (const usage of turns.values()) {
    ctx += (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    out += usage.output_tokens ?? 0;
    cacheCreate += usage.cache_creation_input_tokens ?? 0;
    cacheRead += usage.cache_read_input_tokens ?? 0;
  }
  const durationMs = first && last ? Date.parse(last) - Date.parse(first) : Number.NaN;
  return {
    model,
    turns: turns.size,
    ctx,
    out,
    cache_create: cacheCreate,
    cache_read: cacheRead,
    duration_s: Number.isFinite(durationMs) ? Math.round(durationMs / 1000) : null,
    commits,
    outcome: classifyOutcome(lastText),
    last: lastText.replace(/\s+/g, ' ').trim().slice(0, LAST_TEXT_CHARS),
  };
};

// The event's own `last_assistant_message` is the reliable source for the
// outcome: at SubagentStop the transcript may not have the final text yet.
const stopRow = (input, projectsDir) => {
  const lastGiven =
    typeof input.last_assistant_message === 'string'
      ? input.last_assistant_message.replace(/\s+/g, ' ').trim().slice(0, LAST_TEXT_CHARS)
      : '';
  const base = {
    ev: 'stop',
    ts: new Date().toISOString(),
    session: input.session_id ?? null,
    agent_id: agentIdOf(input),
    type: input.agent_type ?? input.agentType ?? null,
    raw_keys: Object.keys(input),
  };
  const transcriptPath = findTranscript(input, projectsDir);
  if (!transcriptPath) {
    // Claude Code also fires SubagentStop for its own helper invocations (empty
    // agent_type, a transcript path that never materialises) every ~30 s while
    // an agent runs — observed 2026-08-20, 46 of 55 stop events. Not ours: drop.
    if (!base.type) return null;
    return { ...base, model: null, transcript: 'missing', outcome: classifyOutcome(lastGiven), last: lastGiven };
  }
  const meta = readMeta(transcriptPath);
  const fork = meta.isFork === true;
  const skip = fork ? inheritedUuids(transcriptPath, meta, projectsDir, input.session_id) : null;
  const analysed = analyse(transcriptPath, skip);
  const last = lastGiven || analysed.last;
  return {
    ...base,
    type: base.type ?? meta.agentType ?? null,
    ...analysed,
    outcome: classifyOutcome(last),
    last,
    is_fork: fork,
    spawn_depth: meta.spawnDepth ?? null,
    parent_agent: meta.parentAgentId ?? null,
    ...(fork && !skip ? { inherited_rows_possible: true } : {}),
  };
};

const debugRow = (input) => {
  const copy = { ...input };
  if (copy.tool_input && typeof copy.tool_input === 'object') {
    const prompt = copy.tool_input.prompt;
    copy.tool_input = {
      ...copy.tool_input,
      ...(typeof prompt === 'string' ? { prompt: prompt.slice(0, DEBUG_PROMPT_CHARS) } : {}),
    };
  }
  return { mode, ts: new Date().toISOString(), keys: Object.keys(input), input: copy };
};

try {
  const input = readStdin();
  if (!input || typeof input !== 'object') process.exit(0);
  const projectsDir = projectsDirOf(input);
  const file = projectsDir ? path.join(projectsDir, 'dispatch-log.jsonl') : path.join(homedir(), '.claude', 'platform-dispatch-log.jsonl');
  if (process.env.PLATFORM_DISPATCH_DEBUG === '1') append(file.replace(/[^/\\]+$/, 'dispatch-debug.jsonl'), debugRow(input));

  if (mode === 'dispatch') {
    if (input.tool_name !== 'Agent') process.exit(0);
    const row = dispatchRow(input);
    const verdict = waveVerdict(input, row);
    if (verdict) {
      append(file, { ...row, blocked: 'wave-split' });
      append(file, verdict.split);
      process.stderr.write(verdict.message);
      process.exit(2);
    }
    append(file, row);
  } else if (mode === 'start') {
    append(file, startRow(input));
  } else if (mode === 'stop') {
    const row = stopRow(input, projectsDir);
    if (row) append(file, row);
  }
} catch {
  // a log never blocks a tool
}
process.exit(0);
