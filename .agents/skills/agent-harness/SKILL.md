---
name: agent-harness
description: Machine-level mechanics between the agent and this repo — rtk shell compression, skills, hooks, and token economy. Use when shell output looks wrong, installing or removing a skill, or editing a hook.
---

# Harness: rtk, skills, hooks

Machine-level mechanics that sit between the agent and this repo. Nothing here is a code
rule — read it when the tooling behaves in a way the repo doesn't explain.

## Bash goes through rtk

A global hook rewrites shell commands to `rtk <cmd>`, a proxy that compresses output
before it reaches the agent. Registered in `~/.claude/settings.json` (Claude Code) and
`~/.cursor/hooks.json` (Cursor).

**Exempt** (`exclude_commands`), each because compression destroyed evidence:

| Command      | What compression did                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| `git`        | A clean `git status` became "ok"; `git log` dropped merge commits                 |
| `rg`         | Delegated to `grep`, different semantics                                          |
| `npx`, `tsc` | `npx tsc --version` answered "TypeScript: No errors found" instead of the version |

Everything else stays proxied (`cat`→`rtk read`, `ls`, `grep`, `find`, `wc`, lint,
vitest, `docker`, `psql`…) — output arrives reformatted, not in the tool's native
shape. Verified 2026-08-10 on rtk 0.44.2: `pnpm` and `node` are **not** rewritten; file
reads come through complete (`rtk read` defaults to `--level none`); `grep` keeps content
and count but regroups by file.

Odd output? `rtk hook check "<command>"` shows the rewrite, and `rtk proxy <cmd>` re-runs
it unfiltered for comparison.

**The hook is not guaranteed — rtk once vanished from the machine** and the agent kept
blaming compression nobody was applying. Confirm `which rtk` before investigating a
rewrite. If missing: drop the binary from the [`rtk-ai/rtk`](https://github.com/rtk-ai/rtk)
release onto your `PATH` (e.g. a local `bin` directory), then `rtk init -g --auto-patch`
(Claude Code) and `rtk init -g --agent cursor --auto-patch` (Cursor) — both only append
the hook block to existing config.

Config on macOS is `~/Library/Application Support/rtk/config.toml` (**not** the Linux
`~/.config/rtk/`). Reinstalling wipes `exclude_commands` — restore
`["git", "rg", "npx", "tsc"]`. That list takes effect immediately; only registering the
hook needs a Claude Code restart.

## Token economy

Habits that keep long sessions cheap. None change what gets done — only how much output
it takes.

`pnpm tokens:report` measures where the tokens went, reading the transcripts Claude Code
writes outside the repo; `pnpm dispatch:report` measures what the delegation model did —
runs, turns, context and cost per agent type and tier, waves dispatched serially, forks,
dollars per commit — from the append-only `dispatch-log.jsonl` that `dispatch-log.mjs`
writes next to the transcripts on every `Agent` call, `SubagentStart` and `SubagentStop`.
**Baseline of 2026-08-17**, against which a later run is compared
— every claim in this section comes from it:

|                                        |                       |
| -------------------------------------- | --------------------- |
| sessions / assistant turns             | 22 / 3.516            |
| cache read (the dominant cost)         | 722M                  |
| average context per turn               | 205k                  |
| floor of a fresh session               | 41k                   |
| the 8 most expensive sessions          | 91% of all cache read |
| shell output that is navigation        | 87% (968 calls)       |
| shell output that is tests + typecheck | 1,1% (35 calls)       |
| `Agent` calls vs. direct navigation    | 52 vs. 968            |

The last line is the one to watch: `repo-scout` landed on 2026-08-17, so any drop in
navigation volume after that date is the habit taking — or not.

**Delegation baseline of 2026-08-21** (`pnpm dispatch:report`, log window 08-20 → 08-21,
priced on the **last stop row per agent** — a `SendMessage` resume re-emits a stop row whose
context is the whole transcript again, so the earlier per-row pricing overstated ~4.8×):
$660 across 478 unique agents, **$12.95 per commit** over the whole log (≈ $7 on the pilot
feature's waves 2–11 alone); worker warm-up before the first code edit: median **21 turns / 7.2 min**,
16 % of workers never reached one. Those two numbers — dollars per commit and warm-up — are what
the vertical-cluster rule and the direct worker gates (both 2026-08-21) are meant to move; the
measurement method and the raw figures live in the memory note `medicao-tokens-delegacao-2026-08-17`.

**The dominant cost is session length, not output.** Every turn re-sends the whole
conversation, so a session's price grows with the **square** of its turns: turn 500 pays
for the 499 before it. Four sessions that ran 420–600 turns **without ever compacting**
carried most of the bill on their own, ending at 390–585k of context against a 41k floor.
The 1M window is why: nothing ever forced a break.

- **Compact or clear at a natural boundary — the agent picks which.** Feature committed,
  spec phase closed, or a long bug hunt that ended in a small fix — at those points the
  conversation is pure dead weight (the 50 files read to find the 3 that mattered are
  re-paid every remaining turn). Two exits, same trade-off as a sub-agent: a fresh window
  pays a warm-up (≈46k floor plus reading the plan), a long one pays every turn at a
  multiple of that. `/compact` when the work continues in the same direction and the
  recent turns are still the working set (a follow-up of a few turns, a wave mid-feature
  whose plan is in `tasks.md`) — say what must survive the summary. `/clear` when what
  remains is a new stretch of work (dozens of turns) or the direction changed: the work's
  memory is on disk (`.ca-plans/`, git), so write the Handoff first and give the
  user a **ready-to-paste prompt** for the next session — what to load, checkout and
  branch, the exact next step, the 1–3 constraints that must not be lost. **Never clear
  mid-task** — rebuilding from disk costs more than it saves. The signal comes from
  `session-context-checkpoint.mjs` and the status line, but the judgement about which exit
  fits and where the boundary is stays with the agent, never with a hook.
- **Discovery goes to `repo-scout`, not to the main context.** **87% of all shell output
  is navigation** — 587 search calls and 381 file reads through the shell, against 33 for
  tests and 2 for typecheck. Finding code is the cost here, and delegating tests would
  optimise 1% while destroying the failure evidence. A subagent pays navigation in a
  context that gets thrown away. What it returns is `file:line` plus one sentence, never
  file content. The knowledge is the `repo-discovery` skill — where things live, `grep`
  instead of `rg`, the files that must never be opened, and the two couplings here that
  `grep` cannot see — so Cursor and Codex get it too. `.claude/agents/repo-scout.md` is
  only the Claude Code mechanism on top of it.
  **In Claude Code this is enforced, not advised:** `delegate-to-subagent.mjs` lets the
  main agent make two navigation calls per user turn (`ls`, `grep -n` on a known file) and
  blocks the third onward with the exact `Agent(subagent_type: "repo-scout", model: …)`
  call to make instead. Inside a subagent (`agent_id` in the hook input) it exits with no
  enforcement at all unless the subagent's type is in `ENFORCED_AGENTS` — empty today,
  since no `ca-full-cycle` agent type has been wired into it: every subagent,
  the scout included, currently navigates and runs commands with zero enforcement from this
  hook. Subagents can spawn subagents here (verified 2026-08-17: a worker called
  `repo-scout` and got its answer), which is what makes that nesting real.
- **Spec execution is delegated from 4 tasks up, in parallel.** In the `ca-full-cycle` skill a
  plan of ≤3 tasks runs **inline in the planning window** (a worker's warm-up costs more than the
  three files it would write), with its gates through the runner and the Verifier still fresh and
  independent. From 4 tasks up the orchestrator dispatches one `worker`
  per cluster — all clusters of a wave at once — each worker **runs its own scoped gate**
  (`cmd > log 2>&1; echo exit=$?`, then `grep -n` on the log) and nests `repo-scout` for a
  question it cannot scope, one Build gate runs per wave through the runner (scoped to the wave's
  touched areas; the full unit suite runs once, at the Reviewer's Final gate, or per wave
  only when the Wave Plan marks shared code), a fresh wave verifier closes each wave and a
  fresh `Reviewer` closes the feature; a fix→re-verify round resumes that same verifier via
  `SendMessage` while it is under its turn budget. **The tier is judgement per dispatch,
  never hard-coded**: every `Agent` call — to a worker, wave verifier or Reviewer, or to
  `repo-scout`/`shell-runner` — carries an explicit `model`, chosen by what that dispatch
  touches (mechanics → haiku, CRUD/UI → sonnet, domain/contract/migration/ADR-governed →
  opus; Reviewer → opus for auth, payments, data integrity, or a rule the
  product's own domain doc marks critical; scout → haiku for a pointed question, sonnet
  for a module map; runner → haiku). `subagent-model-required.mjs` hook-blocks only the
  `repo-scout`/`shell-runner` call without it, printing that agent's tier guide; a
  worker/verifier/Reviewer's `model` is the `ca-full-cycle` card's own rule, unenforced by
  this hook. The `model:` in the agent's frontmatter is only the fallback for when the hook
  is off. Waves and clusters are authored in the Tasks phase from `Depends on` /
  `Touches` / `Exclusive`. Parallel workers share the checkout, so they commit
  pathspec-limited (`git commit -m … -- <files>`) and never `stash`/`add -A`. Model and
  mechanics: `.agents/skills/ca-full-cycle/references/implement.md` § *Sub-Agent
  Delegation*; workers, wave verifiers and the Reviewer dispatch as
  `Agent(subagent_type: "general-purpose", model: <tier>)` with the card path in the
  payload — there is no per-role agent definition file.
  **Fragility to know:** nested `Agent` calls inside subagents are not documented by
  Anthropic; if a Claude Code update removes them, an enforced worker can neither
  navigate nor delegate — the fix, if a `ca-full-cycle` agent type is ever wired into
  `ENFORCED_AGENTS`, is to drop it from that set until nesting is back; moot today since
  the set is empty.
- **The main window's gates go to `shell-runner`.** Test, typecheck, lint and build are
  blocked in the main thread by the same hook and delegated to `.claude/agents/shell-runner.md`
  (haiku on almost every dispatch, `Bash` + `Read`). It saves the whole log to a file and returns exit code
  plus the failures **verbatim** — test name, assert message, `file:line` — with the log
  path, so nothing is lost, only kept out of the main context. Measured, this category is
  <1% of shell output (rtk already compresses vitest), so the saving here is small; the
  reason it is delegated is that one unfiltered run can still be tens of thousands of
  tokens. **Two callers only** — the orchestrator's Build gate per wave and the Verifier's
  Final gate: a worker and the Verifier's sensor run their own scoped gates directly,
  because the hop cost more than it saved (2026-08-21: 73 of 196 worker→runner dispatches
  had to be escalated to sonnet just to slice a red log). Output redirected to a file (`> log`) is never blocked, and
  `PLATFORM_DELEGATE_OFF=1` disables the hook while debugging the harness itself.
- **Read run artifacts by section, never whole.** The project's decision log
  (`.ca-plans/DECISIONS.md`) and a run's own `research.md`/`plan.md`/`review.md` — a run's
  `plan.md` carries a `## Handoff` section only while paused or blocked, deleted once acted
  on, never archived — are the most re-read documents here, and each one lands in context
  for the rest of the session. Use `offset`/`limit` or grep for the section — measured habit
  (pre-migration, 2026-08-17) was 150 whole-file reads against 39 with a range. Workers and
  the wave verifier read only their card (`references/cards/*.md`) whole and never the
  project's decision log; the orchestrator reads its current phase reference whole. Measured
  2026-08-20, of the bytes the main window Read after delegating Implement: run/decision
  artifacts 50 % (the heaviest single file alone 577 KB over 31 reads), skill references
  read whole 23 %, chained ranged reads paging through one file 22 %, code 3 % — so
  `delegate-to-subagent.mjs` now caps the main thread at 48 KB of `Read` per user turn, any
  directory, ranged or not; past it the read is blocked and the cheap path named.
- **Everything under `.ca-plans/` is English, enforced.** Those are the most re-read files in
  the repo and agents are their only readers; pt-BR tokenizes ~30% heavier, so a decision
  recorded in pt-BR is a surcharge on every Design and every resume for the life of the
  project. `plans-in-english.mjs` (PreToolUse on `Edit|Write|MultiEdit`) blocks a write to
  `.ca-plans/**` whose new text reads as pt-BR prose — pt-BR function words ≥10% of the
  words, or ≥5% with diacritics ≥10%; fenced/inline code and URLs are ignored, `.json` is
  exempt, and fewer than 12 words never trip it. Quoted product strings inside English
  sentences stay under the bar by construction. The rule is Critical Rule 6 of
  `ca-full-cycle` and `.agents/skills/dev-workflow/SKILL.md`; `PLATFORM_SPECS_LANG_OFF=1` disables the
  hook while debugging the harness.
- **Browser inspection: `take_snapshot` first.** The accessibility-tree snapshot costs a
  fraction of a screenshot and is the right input for finding and clicking elements.
  Screenshot only when the question is genuinely visual — color, alignment, design token.
- **Contract questions go through the purpose-built commands.** `pnpm contract:diff` for
  what changed in `openapi.json`, `pnpm contract:consumers` for who consumes an
  operationId. Reading the raw file or its diff is among the most expensive reads in the
  repo.
- **Targeted tests while iterating.** `pnpm vitest run --project api|web <path>`; the full
  suite is a final confirmation, not a first probe. Large vitest runs dump tens of
  thousands of tokens, and rtk has fabricated failures on them before — reconfirm odd
  results with `rtk proxy`.
- **Point at logs, don't inline them.** Save long output to a file and read the relevant
  slice with grep/offset; pasted logs are re-paid as input on every following turn.

## Skills

Skills live in **`.agents/skills/`** — single versioned source, read natively by Cursor
and Codex. Claude Code only sees `.claude/skills/`, which therefore holds nothing but
symlinks to the canonical path (git versions symlinks, so a fresh clone works).

After installing or removing one, run `pnpm skills:sync` — it creates missing links,
replaces a stray copy with a link, and deletes orphaned links.

**Never** edit a skill from inside `.claude/skills/` as if it were your own copy, and
never recreate `.cursor/skills` — Cursor reads `.agents` directly.

## Off-pattern and correct that way

- `.claude/settings.json` and `.claude/hooks/` are Claude Code mechanisms with no
  equivalent in the other harnesses, so they stay where they are.
- `AGENTS.md` is the real file and `CLAUDE.md` a symlink to it — one edit covers all
  three harnesses.

## Repo hooks

- `.claude/hooks/branch-only-in-worktree.mjs` — blocks branch creation in the main
  checkout. Rule in `.agents/skills/dev-workflow/SKILL.md`.
- `.claude/hooks/contract-consumers.mjs` — runs `pnpm contract:consumers` when a
  `*.contract.ts` file is edited. **Claude Code only** — in Cursor and Codex, run the
  command by hand. Rule in `.agents/skills/backend-architecture/SKILL.md`.
- `.claude/hooks/reinject-tripwires.mjs` — re-injects the CLAUDE.md Two standing rules
  section on the next prompt every ~2 MB of transcript growth, so long sessions don't
  drift from the initial instructions.
- `.claude/hooks/edit-reminders.mjs` — design-system and comment-policy reminders on
  edit, rate-limited per session to once every ~2 MB of transcript instead of every edit.
- `.claude/hooks/plans-in-english.mjs` — `PreToolUse(Edit|Write|MultiEdit)`: blocks a
  write under `.ca-plans/` whose new text reads as pt-BR prose (thresholds and exemptions in
  [Token economy](#token-economy); constants at the top of the file). Fires in the main
  thread and inside subagents alike; `PLATFORM_SPECS_LANG_OFF=1` disables it. Rule in
  `.agents/skills/dev-workflow/SKILL.md` and `ca-full-cycle` Critical Rule 6.
- `.claude/hooks/docs-stay-lean.mjs` — `PreToolUse(Edit|Write|MultiEdit|Bash)`: blocks a
  handbook edit (`docs/` outside `advisories/`, `CLAUDE.md`/`AGENTS.md`, the
  `.md.jinja` variants included) that grows the file by more than 30 lines or a new handbook
  over 80 lines, and any shell write into those
  files (heredoc, `sed -i`, `tee`, `open(…, 'w')`) so the text always passes through
  Edit/Write. Constants at the top of the file; `PLATFORM_DOCS_LEAN_OFF=1` disables it. Rule
  in `.agents/skills/code-quality/SKILL.md` § Documentation.
- `.claude/hooks/template-behind.mjs` — `SessionStart` and the first `UserPromptSubmit`:
  in a generated product, compares `.copier-answers.yml`'s `_commit` with the latest
  stable `v*` tag of `_src_path` (one `git ls-remote` per 24h per machine, cached in the
  OS temp dir, 8s timeout, silent offline) and names the `template-update` skill when the
  product is behind. Silent in the template repository. Sibling of
  `pending-advisories.mjs`, which does the same for catalog advisories. Rule in
  `docs/dev/template.md`.
- `.claude/hooks/delegate-to-subagent.mjs` — `PreToolUse(Bash|Grep|Glob|Read)`: blocks
  navigation in the main thread past a per-turn quota (2) and every test/typecheck/lint/
  build run (quota 0), naming the subagent to call — `repo-scout` or `shell-runner`. A
  piped Bash command is classified by its first pipe segment only (`git status --short |
head` isn't navigation — a filter after a pipe reduces what enters the context); the
  redirect-to-file check still runs on the whole statement. A Bash statement whose path
  arguments are **all** under `.claude/`, `.agents/`, `.agents/skills/`, `scripts/` or
  `.ca-plans/` (`HARNESS_DIRS`) doesn't count as navigation — the quota exists to push
  exploration of _product_ code to `repo-scout`, while editing the harness itself is work
  the main thread does directly; a statement with no path argument, or with one path
  outside the list, counts as before. A `Read` counts as one navigation against the same
  quota when it's a whole-file or large read of source (`limit` absent or >
  `READ_FREE_LINES` = 200 lines); ranged reads and anything under `.ca-plans/`, `.claude/`,
  `.agents/`, `docs/` or outside the project stay free — `no-huge-reads.mjs` remains the
  separate hard size cap. Silent inside subagents
  (`agent_id`), for output redirected to a file, and with `PLATFORM_DELEGATE_OFF=1`.
  `ENFORCED_AGENTS` is empty today — no `ca-full-cycle` agent type is wired into it — so the
  Read **byte** budget for an agent's lifetime (`READ_BYTES_FREE_PER_AGENT`
  = 120 000), the guard against reading a 30 kB reference whole before the first edit,
  currently applies to none: a worker's own turn-budget discipline (the `ca-full-cycle`
  card) is what limits it instead. Every `Read`
  counts **bytes** against a budget (`READ_BYTES_FREE_PER_TURN` = 48 000 per user turn on
  the main thread), in any directory, ranged or
  not — a ranged read by the byte length of its lines, a whole read by the file size; over
  budget it is blocked with the cheap path (scout for the section, one `STATE.md` section,
  the card instead of the reference). The `UserPromptSubmit` entry (`reset` arg) zeroes the
  main thread's quota and byte budget each user turn. Quotas, budget and the enforced list
  are the constants at the top of the file. Rule in [Token economy](#token-economy).
- `.claude/hooks/subagent-model-required.mjs` — `PreToolUse(Agent)`: blocks a dispatch of
  `repo-scout` or `shell-runner` whose `model` is missing or outside
  `haiku|sonnet|opus|fable`, and prints that agent's tier guide (the `GUIDE` map at the top
  of the file); every other dispatch, worker/wave-verifier/Reviewer included, is only
  tagged with its `model` (or `inherit`) and passed through. Fires in the main thread and
  inside nesting subagents alike. Also holds the nesting shape: `NESTING_AGENTS` is empty
  today — no agent type is blocked from nesting through this hook —
  while `repo-scout`/`shell-runner` (`LEAF_AGENTS`) still never dispatch further. The
  `shell-runner` guide names its two callers — the orchestrator's Build gate and the
  Verifier's Final gate — since a worker runs its own scoped gate. The `model:` in each
  agent's frontmatter is only the fallback for when the hook is off (`PLATFORM_DELEGATE_OFF=1`).
  Rule in [Token economy](#token-economy).
- `.claude/hooks/dispatch-log.mjs` — `PreToolUse(Agent)` (`dispatch`), `SubagentStart`
  (`start`), `SubagentStop` (`stop`): appends one JSON line per event to
  `~/.claude/projects/<slug>/dispatch-log.jsonl` (the directory of the session's main
  transcript; fallback `~/.claude/platform-dispatch-log.jsonl`) — who dispatched what, tier,
  wave/cluster parsed from the payload, and on stop the run's turns, context, output,
  commit hashes, outcome and last text read from the subagent transcript (assistant rows
  deduped by `message.id`; a fork's inherited rows skipped by uuid). Never blocks: any
  failure exits 0. `PLATFORM_DISPATCH_DEBUG=1` also dumps the raw stdin of each event to
  `dispatch-debug.jsonl` — the `SubagentStart`/`SubagentStop` fields are undocumented, and
  `raw_keys` on every start/stop row records what the harness actually sends (confirmed
  live 2026-08-20: stop carries `agent_transcript_path` and `last_assistant_message`; the
  latter is the outcome source, since the transcript may lack the final text at stop time).
  Claude Code also fires `SubagentStop` for its own helper invocations — empty `agent_type`,
  a transcript that never materialises, every ~30 s while an agent runs — and those are
  dropped, not logged. Hooks registered in `settings.json` took effect without a restart. Read with
  `pnpm dispatch:report` (`scripts/dispatch-report.mjs`). The `dispatch` mode also enforces
  **a wave is one message** on the main thread: a `worker` payload naming `wave <w>`
  and `Cluster C<k>` is blocked (exit 2 + a `wave-split` row) when another cluster of that
  wave went out more than 2 min earlier — unless that label was already dispatched (a
  continuation keeps its label), 4 clusters already went out together (FIFO tail), the
  payload states `serial-ok: <reason>`, or a block happened under 3 min ago (the orchestrator
  is re-issuing the wave in one message). Measured 2026-08-20: 16 of 17 declared
  multi-cluster waves were dispatched one worker at a time, 26–60 min apart. Per-session
  state in the tmpdir (`platform-wave-<session>.json`). Rule in
  [Token economy](#token-economy) and `ca-full-cycle` implement.md § *Dispatch the wave*.
- `wave-plan-check.mjs` (removed) — `PostToolUse(Edit|Write|MultiEdit)` on
  `.ca-plans/*/plan*.md`: re-runs two rules of the Wave/Cluster Cross-Check after every write
  of a task plan — sibling clusters of one wave share no path (exact, or glob containment:
  `a/b/**`, `a/b/*`, `a/b/` cover a file under `a/b/`) and an `Exclusive: yes` task is alone
  in its wave — from the `### T<n>` `Touches` fields and the `## Wave Plan` table (the
  table's files column is the fallback when a task has no parsed `Touches`). One stderr line
  per violation, exit 2; a missing section exits 0. Measured 2026-08-20: 3 of 4
  `blocked-by-ownership` stops were unlisted files (the Touches audit in `ca-full-cycle`
  plan.md § *Touches audit* is the fix for those), the fourth a planned sibling overlap — what this hook
  catches. Rule in `ca-full-cycle` plan.md § *Cross-check*.
- `.claude/hooks/no-huge-reads.mjs` — blocks reading a file over 100k chars whole, via
  `Read` or via `cat`/`less`/`rtk read`. By **size**, not by a list, so it also catches the
  lockfile, a new drizzle snapshot and an engine fixture. A ranged read (`limit` ≤ 400) or
  a `grep`/`head` passes. The message names the cheap path for each known offender.
  **Claude Code only** — in Cursor and Codex the rule is the never-open list in the
  `repo-discovery` skill.
- `.claude/hooks/session-context-checkpoint.mjs` — warns the agent once the session
  crosses 120k tokens of context, then every +60k, asking it to reach the next natural
  boundary and then choose `/compact` (same direction, recent turns still the working
  set) or `/clear` (new stretch of work or a change of direction — Handoff written, plus
  a ready-to-paste prompt for the next session in the user's language); at 250k it asks
  the agent to stop starting new work and hand off now, `/clear` by default. It only
  measures and reports; it never clears or compacts. Rule in
  [Token economy](#token-economy).
- `.claude/hooks/no-servers-left-behind.mjs` — `SubagentStart` (`arm`), `SubagentStop`
  (`sweep`): an agent leaves no dev server hanging. `arm` records, when the first agent of a
  batch starts, which servers were already alive; `sweep` terminates, when the last one
  exits, every family that appeared since — a `pnpm dev` or `nest start --watch` a worker
  booted and never killed holds the port and keeps compiling until the machine reboots.
  With a sibling still running the sweep is deferred: a fan-out shares the process table,
  and only the last agent out tells a leak from a server another worker is still using. An
  agent that dies without its stop event drops out of the batch after 90 min. Per-session
  state in the tmpdir (`platform-servers-<session>.json`), never blocks a stop,
  `PLATFORM_SERVER_SWEEP_OFF=1` disables it — the escape hatch for a server an agent booted
  for the main thread to use.
- `.claude/hooks/kill-orphan-dev-servers.mjs` — `SessionEnd`: the backstop of the one
  above, over every checkout sharing the repo's git dir (linked worktrees included).
  Detection in `lib/dev-servers.mjs`, shared by both: a process holding a port or a watcher
  (vite, `nest start`, `next dev`, a `--watch` tsc/vitest/jest, nodemon/tsx, drizzle studio,
  `node dist/main`, an attached `docker compose up`), climbing from the leaf to the wrapper
  that owns the port (`pnpm dev`, `concurrently`) to kill the whole family — SIGTERM on the
  leaf alone leaves the wrapper respawning it. A one-shot run (`vite build`, `vitest run`)
  is not a server, and what runs in a **terminal of the main checkout** is the user's and is
  never touched. **Claude Code only** — in Cursor and Codex, kill the server by hand.
- `.claude/statusline.mjs` — status line showing the session's current context, dim below
  150k, yellow above, red above 300k. Both read the exact figure from the last `usage`
  entry in the transcript via `.claude/hooks/lib/transcript-context.mjs` — the file size
  is a bad proxy, since it keeps turns already dropped from context.
