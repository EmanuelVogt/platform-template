#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit) on `.specs/**/tasks.md`: re-runs the three
// mechanical rules of the Wave/Cluster Cross-Check (tlc-spec-driven tasks.md)
// on every write of a task plan — sibling clusters of one wave share no file,
// an `Exclusive: yes` task is alone in its wave, and a wave does not hold three
// or more single-task non-exclusive clusters. Two clusters in the same
// wave are two workers in the same checkout at the same time: a shared path is
// a race, not a slowdown. Measured 2026-08-20: 3 of 4 `blocked-by-ownership`
// stops were files no task listed (under-specified `Touches`) and the fourth
// was a planned overlap between siblings — the overlap this hook catches; the
// audit for the other three is the Touches audit in tasks.md § 3.
// The third rule is a granularity warning, not a race: measured 2026-08-21 over
// one feature's waves 2–11, 44 of 45 clusters held a single task and each of
// the 43 workers paid a median 21 turns of warm-up before its first edit. A
// cluster is a vertical slice of 4–8 tasks; a single-task cluster is for an
// exclusive or a genuinely isolated task.
// Tolerant parser: a missing Wave Plan or Touches field exits 0 — the check
// never blocks a plan being drafted, only reports a plan that contradicts
// itself. Violations go to stderr with exit 2 (PostToolUse: the write already
// landed; the agent sees the lines and fixes the plan).
// Harness tooling — not app code.
import { readFileSync } from 'node:fs';
import path from 'node:path';

let data;
try {
  data = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const filePath = data.tool_input?.file_path;
if (typeof filePath !== 'string') process.exit(0);
const abs = path.resolve(data.cwd || process.cwd(), filePath);
if (!/\.specs\/.*\/tasks\.md$/.test(abs.split(path.sep).join('/'))) process.exit(0);

let text;
try {
  text = readFileSync(abs, 'utf8');
} catch {
  process.exit(0);
}

const isPathLike = (s) => !/\s/.test(s) && (s.includes('/') || /\w\.\w+$/.test(s));

// commas split entries only outside `{a,b}` brace sets
const splitCommas = (s) => {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of s) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  out.push(current);
  return out;
};

// Touches entries: backticked tokens when present, else bare comma/newline-
// separated tokens that look like paths ("tests included"-style prose dropped).
const parseEntries = (raw) => {
  const ticked = [...raw.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const source = ticked.length > 0 ? ticked : raw.split(/\n|\s\+\s/);
  return source.flatMap(splitCommas).map((s) => s.trim()).filter((s) => s && isPathLike(s));
};

// `- **Touches**: a, b` · `**Touches:** a, b` · `Touches:` + bullets, also
// mid-line after `·`; the value runs to a blank line, a heading or the next
// bold field (a bold label, never the `**` of a glob).
const fieldValue = (body, name) => {
  const re = new RegExp(`\\b${name}(?:\\*\\*)?:(?:\\*\\*)?\\s*(.*)$`, 'm');
  const m = re.exec(body);
  if (!m) return null;
  const lines = [m[1]];
  const rest = body.slice(m.index + m[0].length).split('\n').slice(1);
  for (const line of rest) {
    if (!line.trim() || /^\s*#/.test(line) || /^\s*(?:-\s*)?\*\*[A-Za-z]/.test(line)) break;
    lines.push(line);
  }
  return lines.join('\n').split(/\s·\s|\*\*(?=[A-Za-z][\w ]*\*\*)/)[0];
};

const tasks = new Map();
const taskSections = text.split(/^(?=##\s|###\s+T\d+\b)/m).filter((s) => /^###\s+T\d+\b/.test(s));
for (const section of taskSections) {
  const id = /^###\s+(T\d+)/.exec(section)[1];
  const touchesRaw = fieldValue(section, 'Touches');
  const exclusiveRaw = fieldValue(section, 'Exclusive');
  tasks.set(id, {
    touches: touchesRaw === null ? null : parseEntries(touchesRaw),
    exclusive: exclusiveRaw !== null && /^\s*yes\b/i.test(exclusiveRaw),
  });
}

const planMatch = /^##\s+Wave Plan\b[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(text);
if (!planMatch) process.exit(0);

const clusters = [];
for (const line of planMatch[1].split('\n')) {
  if (!/^\s*\|/.test(line)) continue;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 4) continue;
  const wave = Number.parseInt(cells[0], 10);
  if (!Number.isFinite(wave)) continue;
  const label = cells[1];
  const taskIds = cells[2].match(/T\d+/g) ?? [];
  if (!label || taskIds.length === 0) continue;
  const fallback = parseEntries(cells[3]);
  const owned = new Map();
  for (const id of taskIds) {
    const touches = tasks.get(id)?.touches;
    for (const file of touches ?? fallback) {
      if (!owned.has(file)) owned.set(file, touches ? id : label);
    }
  }
  clusters.push({ wave, label, taskIds, owned });
}
if (clusters.length === 0) process.exit(0);

// `a/b/**`, `a/b/*`, `a/b/` → prefix `a/b/`; a path under the prefix is shared
const normalize = (p) => p.replace(/\/\*\*?$/, '/').replace(/^\.\//, '');
const shares = (a, b) => {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return true;
  if (x.endsWith('/') && (y.startsWith(x) || `${y}/` === x)) return true;
  if (y.endsWith('/') && (x.startsWith(y) || `${x}/` === y)) return true;
  return false;
};

const violations = [];
const byWave = new Map();
for (const c of clusters) {
  if (!byWave.has(c.wave)) byWave.set(c.wave, []);
  byWave.get(c.wave).push(c);
}
for (const [wave, siblings] of [...byWave.entries()].sort((a, b) => a[0] - b[0])) {
  for (let i = 0; i < siblings.length; i += 1) {
    for (let j = i + 1; j < siblings.length; j += 1) {
      const a = siblings[i];
      const b = siblings[j];
      const seen = new Set();
      for (const [fa, ta] of a.owned) {
        for (const [fb, tb] of b.owned) {
          if (!shares(fa, fb)) continue;
          const shown = fa === fb ? `\`${fa}\`` : `\`${fa}\` ∩ \`${fb}\``;
          if (seen.has(shown)) continue;
          seen.add(shown);
          violations.push(
            `Wave ${wave}: ${a.label} and ${b.label} both touch ${shown} (${ta} ↔ ${tb}) — same wave = same checkout at the same time; move one to a later wave or split the file into a wiring task (tasks.md § 3).`,
          );
        }
      }
    }
  }
  const solo = siblings.filter((c) => c.taskIds.length === 1 && !tasks.get(c.taskIds[0])?.exclusive);
  if (solo.length >= 3) {
    violations.push(
      `Wave ${wave}: ${solo.length} single-task non-exclusive clusters (${solo.map((c) => `${c.label}: ${c.taskIds[0]}`).join(', ')}) — a cluster is a vertical slice of 4–8 tasks; each extra worker repays its warm-up for one file. Merge them into the slice's cluster, wiring last (tasks.md § 4).`,
    );
  }

  const waveTasks = siblings.flatMap((c) => c.taskIds.map((id) => ({ id, label: c.label })));
  for (const { id, label } of waveTasks) {
    if (!tasks.get(id)?.exclusive || waveTasks.length === 1) continue;
    const others = waveTasks.filter((t) => t.id !== id).map((t) => `${t.id} (${t.label})`).join(', ');
    violations.push(
      `Wave ${wave}: ${id} (${label}) is \`Exclusive: yes\` but shares the wave with ${others} — an exclusive task is the only task in its wave (tasks.md § 3).`,
    );
  }
}

if (violations.length === 0) process.exit(0);
process.stderr.write(`${violations.join('\n')}\n`);
process.exit(2);
