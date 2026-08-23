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
release into `~/.local/bin`, then `rtk init -g --auto-patch` (Claude Code) and
`rtk init -g --agent cursor --auto-patch` (Cursor) — both only append the hook block to
existing config.

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
feature's waves 2–11 alone); spec-worker warm-up before the first code edit: median **21 turns / 7.2 min**,
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
  memory is on disk (`.specs/`, `STATE.md`, git), so write the Handoff first and give the
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
  call to make instead. Inside a subagent (`agent_id` in the hook input) it counts no
  navigation and no run — the scout navigates freely, and `spec-worker`/`spec-verifier`
  (`ENFORCED_AGENTS`) keep only a Read **byte** budget for their lifetime, since 2026-08-21
  they run their own gates. Subagents can spawn subagents here (verified 2026-08-17: a worker called
  `repo-scout` and got its answer), which is what makes that nesting real.
- **Spec execution is delegated from 4 tasks up, in parallel.** In the `tlc-spec-driven` skill a
  plan of ≤3 tasks runs **inline in the planning window** (a worker's warm-up costs more than the
  three files it would write), with its gates through the runner and the Verifier still fresh and
  independent. From 4 tasks up the orchestrator dispatches one `spec-worker`
  per cluster — all clusters of a wave at once — each worker **runs its own scoped gate**
  (`cmd > log 2>&1; echo exit=$?`, then `grep -n` on the log) and nests `repo-scout` for a
  question it cannot scope, one Build gate runs per wave through the runner (scoped to the wave's
  touched areas; the full unit suite runs once, at the Verifier's Final gate, or per wave
  only when the Wave Plan marks shared code), and a fresh `spec-verifier` closes the
  feature; a fix→re-verify round resumes that same Verifier via `SendMessage` while it is
  under its turn budget. **The tier is judgement per dispatch, never
  hard-coded**: every `Agent` call to one of the four repo agents (`repo-scout`,
  `shell-runner`, `spec-worker`, `spec-verifier`) carries an explicit `model`, chosen by
  what that dispatch touches (mechanics → haiku, CRUD/UI → sonnet, domain/contract/
  migration/ADR-governed → opus; Verifier → opus for auth, payments, booking rules, data
  integrity; scout → haiku for a pointed question, sonnet for a module map; runner →
  haiku). `subagent-model-required.mjs` blocks the call without it and prints that
  agent's tier guide; the `model:` in the agent's frontmatter is only the fallback for
  when the hook is off. Waves and clusters are authored in the Tasks phase from `Depends on` /
  `Touches` / `Exclusive`. Parallel workers share the checkout, so they commit
  pathspec-limited (`git commit -m … -- <files>`) and never `stash`/`add -A`. Model and
  mechanics: `.agents/skills/tlc-spec-driven/references/sub-agents.md`; the agent
  definitions are `.claude/agents/spec-worker.md` and `spec-verifier.md`.
  **Fragility to know:** nested `Agent` calls inside subagents are not documented by
  Anthropic; if a Claude Code update removes them, an enforced worker can neither
  navigate nor delegate — the fix is to drop `spec-worker`/`spec-verifier` from
  `ENFORCED_AGENTS` in the hook until nesting is back.
- **The main window's gates go to `shell-runner`.** Test, typecheck, lint and build are
  blocked in the main thread by the same hook and delegated to `.claude/agents/shell-runner.md`
  (haiku on almost every dispatch, `Bash` + `Read`). It saves the whole log to a file and returns exit code
  plus the failures **verbatim** — test name, assert message, `file:line` — with the log
  path, so nothing is lost, only kept out of the main context. Measured, this category is
  <1% of shell output (rtk already compresses vitest), so the saving here is small; the
  reason it is delegated is that one unfiltered run can still be tens of thousands of
  tokens. **Two callers only** — the orchestrator's Build gate per wave and the Verifier's
  Final gate: a `spec-worker` and the Verifier's sensor run their own scoped gates directly,
  because the hop cost more than it saved (2026-08-21: 73 of 196 worker→runner dispatches
  had to be escalated to sonnet just to slice a red log). Output redirected to a file (`> log`) is never blocked, and
  `PLATFORM_DELEGATE_OFF=1` disables the hook while debugging the harness itself.
- **Read specs by section, never whole.** `STATE.md` (37k chars after the 2026-08-17
  prune — its Handoff carries only open work; closed features' entries live in
  `.specs/features/done/<feature>/handoff-archive.md`), a `tasks.md` (40k) and the
  `tlc-spec-driven` references (`implement.md` 28k, `sub-agents.md` 30k) are the most
  re-read documents here, and each one lands in context for the rest of the session. Use
  `offset`/`limit` or grep for the section — measured habit is 150 whole-file reads
  against 39 with a range. Workers and the Verifier read only their card
  (`references/cards/*.md`) whole and never `STATE.md`; the orchestrator's own contract is
  `cards/orchestrator.md`. Measured 2026-08-20, of the bytes the main window Read after
  delegating Execute: `.specs` 50 % (`STATE.md` alone 577 KB over 31 reads), skill
  references read whole 23 %, chained ranged reads paging through one file 22 %, code
  3 % — so `delegate-to-subagent.mjs` now caps the main thread at 48 KB of `Read` per user
  turn, any directory, ranged or not; past it the read is blocked and the cheap path named.
- **Everything under `.specs/` is English, enforced.** Those are the most re-read files in
  the repo and agents are their only readers; pt-BR tokenizes ~30% heavier, so a decision
  recorded in pt-BR is a surcharge on every Design and every resume for the life of the
  project. `specs-in-english.mjs` (PreToolUse on `Edit|Write|MultiEdit`) blocks a write to
  `.specs/**` whose new text reads as pt-BR prose — pt-BR function words ≥10% of the
  words, or ≥5% with diacritics ≥10%; fenced/inline code and URLs are ignored, `.json` is
  exempt, and fewer than 12 words never trip it. Quoted product strings inside English
  sentences stay under the bar by construction. The rule is Critical Rule 6 of
  `tlc-spec-driven` and `docs/agents/workflow.md`; `PLATFORM_SPECS_LANG_OFF=1` disables the
  hook while debugging the harness. Legacy: `.specs/STATE.md` still holds ~20 pt-BR
  decisions from before 2026-08-17 — translate an entry when you touch it.
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
  checkout. Rule in [`workflow.md`](workflow.md).
- `.claude/hooks/contract-consumers.mjs` — runs `pnpm contract:consumers` when a
  `*.contract.ts` file is edited. **Claude Code only** — in Cursor and Codex, run the
  command by hand. Rule in [`../arch/back.md`](../arch/back.md).
- `.claude/hooks/reinject-tripwires.mjs` — re-injects the CLAUDE.md Tripwires section on
  the next prompt every ~2 MB of transcript growth, so long sessions don't drift from the
  initial instructions.
- `.claude/hooks/edit-reminders.mjs` — design-system and comment-policy reminders on
  edit, rate-limited per session to once every ~2 MB of transcript instead of every edit.
- `.claude/hooks/specs-in-english.mjs` — `PreToolUse(Edit|Write|MultiEdit)`: blocks a
  write under `.specs/` whose new text reads as pt-BR prose (thresholds and exemptions in
  [Token economy](#token-economy); constants at the top of the file). Fires in the main
  thread and inside subagents alike; `PLATFORM_SPECS_LANG_OFF=1` disables it. Rule in
  [`workflow.md`](workflow.md) and `tlc-spec-driven` Critical Rule 6.
- `.claude/hooks/delegate-to-subagent.mjs` — `PreToolUse(Bash|Grep|Glob|Read)`: blocks
  navigation in the main thread past a per-turn quota (2) and every test/typecheck/lint/
  build run (quota 0), naming the subagent to call — `repo-scout` or `shell-runner`. A
  piped Bash command is classified by its first pipe segment only (`git status --short |
head` isn't navigation — a filter after a pipe reduces what enters the context); the
  redirect-to-file check still runs on the whole statement. A Bash statement whose path
  arguments are **all** under `.claude/`, `.agents/`, `docs/agents/`, `scripts/` or
  `.specs/` (`HARNESS_DIRS`) doesn't count as navigation — the quota exists to push
  exploration of _product_ code to `repo-scout`, while editing the harness itself is work
  the main thread does directly; a statement with no path argument, or with one path
  outside the list, counts as before. A `Read` counts as one navigation against the same
  quota when it's a whole-file or large read of source (`limit` absent or >
  `READ_FREE_LINES` = 200 lines); ranged reads and anything under `.specs/`, `.claude/`,
  `.agents/`, `docs/` or outside the project stay free — `no-huge-reads.mjs` remains the
  separate hard size cap. Silent inside subagents
  (`agent_id`), for output redirected to a file, and with `PLATFORM_DELEGATE_OFF=1`.
  Inside `spec-worker` and `spec-verifier` (`ENFORCED_AGENTS`) neither navigation nor heavy
  runs are counted — they run their own scoped gates since 2026-08-21 — and what stays is
  the Read **byte** budget for the agent's lifetime (`READ_BYTES_FREE_PER_AGENT` = 120 000),
  the guard against reading a 30 kB reference whole before the first edit. Every `Read`
  counts **bytes** against a budget (`READ_BYTES_FREE_PER_TURN` = 48 000 per user turn on
  the main thread), in any directory, ranged or
  not — a ranged read by the byte length of its lines, a whole read by the file size; over
  budget it is blocked with the cheap path (scout for the section, one `STATE.md` section,
  the card instead of the reference). The `UserPromptSubmit` entry (`reset` arg) zeroes the
  main thread's quota and byte budget each user turn. Quotas, budget and the enforced list
  are the constants at the top of the file. Rule in [Token economy](#token-economy).
- `.claude/hooks/subagent-model-required.mjs` — `PreToolUse(Agent)`: blocks a dispatch of
  `repo-scout`, `shell-runner`, `spec-worker` or `spec-verifier` whose `model` is missing
  or outside `haiku|sonnet|opus`, and prints that agent's tier guide (the `GUIDE` map at
  the top of the file). Fires in the main thread and inside nesting subagents alike; other
  agent types pass. Also holds the nesting shape: inside a `spec-worker`/`spec-verifier`
  only `repo-scout` and `shell-runner` may be dispatched (a `fork` or a "noop" placeholder
  to wait for a notification is blocked — measured 2026-08-20, 24 of 24 forks spawned by
  workers were such placeholders, each re-serving the worker's whole context), and inside
  a `repo-scout`/`shell-runner` any `Agent` call is blocked. The `shell-runner` guide names
  its two callers — the orchestrator's Build gate and the Verifier's Final gate — since a
  worker runs its own scoped gate. The `model:` in each agent's
  frontmatter is only the fallback for when the hook is off (`PLATFORM_DELEGATE_OFF=1`).
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
  **a wave is one message** on the main thread: a `spec-worker` payload naming `wave <w>`
  and `Cluster C<k>` is blocked (exit 2 + a `wave-split` row) when another cluster of that
  wave went out more than 2 min earlier — unless that label was already dispatched (a
  continuation keeps its label), 4 clusters already went out together (FIFO tail), the
  payload states `serial-ok: <reason>`, or a block happened under 3 min ago (the orchestrator
  is re-issuing the wave in one message). Measured 2026-08-20: 16 of 17 declared
  multi-cluster waves were dispatched one worker at a time, 26–60 min apart. Per-session
  state in the tmpdir (`platform-wave-<session>.json`). Rule in
  [Token economy](#token-economy) and `tlc-spec-driven` § _Dispatch protocol_ step 2.
- `.claude/hooks/wave-plan-check.mjs` — `PostToolUse(Edit|Write|MultiEdit)` on
  `.specs/**/tasks.md`: re-runs two rules of the Wave/Cluster Cross-Check after every write
  of a task plan — sibling clusters of one wave share no path (exact, or glob containment:
  `a/b/**`, `a/b/*`, `a/b/` cover a file under `a/b/`) and an `Exclusive: yes` task is alone
  in its wave — from the `### T<n>` `Touches` fields and the `## Wave Plan` table (the
  table's files column is the fallback when a task has no parsed `Touches`). One stderr line
  per violation, exit 2; a missing section exits 0. Measured 2026-08-20: 3 of 4
  `blocked-by-ownership` stops were unlisted files (the Touches audit in `tlc-spec-driven`
  tasks.md § 3 is the fix for those), the fourth a planned sibling overlap — what this hook
  catches. Rule in `tlc-spec-driven` tasks.md § _Wave/Cluster Cross-Check_.
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
- `.claude/statusline.mjs` — status line showing the session's current context, dim below
  150k, yellow above, red above 300k. Both read the exact figure from the last `usage`
  entry in the transcript via `.claude/hooks/lib/transcript-context.mjs` — the file size
  is a bad proxy, since it keeps turns already dropped from context.
