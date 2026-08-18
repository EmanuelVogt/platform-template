# Sub-Agent Delegation (Execute)

Full mechanics of Execute: roles, wave/cluster planning, dispatch protocol, the parallel-safe git
protocol, gates, failure handling, and the Verifier.

## The one rule

**The orchestrator never writes code.** The window that specified, designed and broke the feature
into tasks is the most expensive context in the session and holds the whole plan; every line of
implementation it writes is paid again on every later turn. Execute is therefore **always
delegated** — no threshold, no offer, no "small enough to do inline". A one-task feature dispatches
one worker and one Verifier, exactly like a forty-task feature dispatches many.

## Roles

| Role | Does | Tier (chosen per dispatch) | Nests |
| --- | --- | --- | --- |
| **Orchestrator** | Reads the plan, computes/validates waves and clusters, dispatches, collects compact summaries, updates `tasks.md`, runs the wave gate, dispatches the Verifier, routes gaps. Never edits code, never runs a test itself. | The main window (strong) | dispatches everything below |
| **Worker** | Executes ONE cluster: its tasks in order, each through the per-task cycle (tests → implement → scoped gate → atomic commit). Reports a compact summary. | low/mid/high per cluster, see *Model selection* | `scout`, `runner` |
| **Scout** | Finds code for a worker/verifier: where a symbol lives, who consumes it, the map of the area a task touches. Returns `file:line` + one sentence, never file content. | low (haiku) for a pointed question; mid (sonnet) for a module map or when finding needs judgement | — |
| **Runner** | Runs a gate/test/typecheck/lint/build command, saves the full log to a file, returns exit code + literal failures. | low (haiku); mid only for a multi-step run or a log with dozens of failures to slice | — |
| **Verifier** | Independent, fresh: spec-anchored coverage check, discrimination sensor, Final gate, `validation.md`, lessons. Never fixes. | mid (sonnet); high per feature risk, see *Model selection* | `scout`, `runner` |

**Each role reads its card, not the references.** The worker's whole contract is
`references/cards/worker.md`, the Verifier's is `references/cards/verifier.md` — ≤4 kB, the only
file the payload tells them to read whole. `implement.md`, `sub-agents.md` and `validate.md` are the
rationale layer behind the cards: read by section with `offset`/`limit` when one rule needs its why.

**Turn budget ≈120 per agent, with handoff.** A worker or Verifier that runs out of turns mid-work
commits/records what is green and ends its summary with a `HANDOFF:` block (tasks or steps done,
next one with its `file:line`, decisions already taken, what remains). For the orchestrator a
`HANDOFF:` is not a failure and not a new cluster: **re-dispatch a fresh agent of the same type and
the same tier, with the handoff block pasted as the first lines of its payload**, and keep counting
it as the same cluster (or the same Verifier run) in `tasks.md` and in the wave report — where the
tier is stated, as for any dispatch. Escalation rules apply to `gate-failed`, never to a handoff.

### Model selection — judgement per dispatch, never hard-coded

**Delegation is always; the tier is a decision — on every dispatch, for every role.** The
`model:` in an agent definition is only a fallback for when the harness hook is off; the caller
passes `model` on every `Agent` call (worker, verifier, scout and runner alike) by looking at what
that dispatch actually touches. In Claude Code the `subagent-model-required.mjs` hook blocks a
call to any of the four repo agents without an explicit `model` and prints that agent's tier
guide. Cost is per worker and disposable; a wrong tier costs a re-dispatch or, worse, a bad merge
— pick by risk, not by habit.

**Sonnet is the default for every worker cluster — no exception for "central" or "everyone
depends on it".** That includes root config, tooling, CI and docs, and tests written from a
precise spec. Opus is narrow: only when the cluster edits domain entities/transitions,
transaction/outbox/ALS code, a migration, contract regeneration, or a rule an ADR governs.
"Ordering-sensitive config" is not, by itself, a reason for opus — a precise `Touches` payload is
the mitigation for a wide-blast-radius file, not a stronger model. The Verifier follows the same
default: sonnet unless the spec touches auth, payments, availability/booking rules, or data
integrity (P0) — tooling, CI, docs and build/resolution features stay sonnet even sitting in a
pre-push gate or the prod build path. Haiku stays for pure mechanics, but its payload must say
"surgical edits, no formatter runs" — a haiku docs worker reformatted two files with prettier on
2026-08-17 with no such instruction.

**Cost anchor:** an opus sub-agent runs ≈5× the token cost of sonnet per token. Measured
2026-08-17: one Medium feature (5 commits, ~130 lines) spent ≈$118 of ≈$155 on opus
spec-workers plus one opus verifier; the 51 haiku scouts/runners in the same feature cost ≈$3.

| Tier | Worker — when the cluster… | Verifier — when the feature… | Scout / Runner |
| --- | --- | --- | --- |
| **low** (haiku) | is pure mechanics: fixtures, renames, config, copy, a spec file mirroring an existing one — payload must forbid reformatting | never | runner always; scout for one known symbol |
| **mid** (sonnet) — default for every cluster | is anything not listed under high: CRUD, UI from the design system, tests from a precise spec, root config, tooling, CI, docs, wiring with an existing pattern to copy | default for every feature: spec has precise outcomes and nothing below applies | scout default |
| **high** (opus) — narrow | edits domain entities/transitions, transactions/outbox/ALS, a migration, contract regeneration, or a rule an ADR governs | touches auth, payments, availability/booking rules, or data integrity (P0) — a weak verifier passing bad work is worse than none | scout for a whole-module map when the answer drives design |

**Escalate before you repeat:** a cluster STOPPED `gate-failed` twice at one tier is re-dispatched
one tier up, not a third time at the same tier; a Verifier FAIL whose gaps are architectural rather
than test-shaped means the *worker* tier was wrong for that cluster — fix at the higher tier and
note it in the wave report. State the tier you chose and why in the wave's one-line report, so the
user can correct the habit, not just the outcome.

**Nesting is what keeps worker context clean.** A worker's own context is disposable, but a
worker that greps its way through the repo and pastes 3 000 lines of jest output into itself
loses the task. Navigation and heavy commands go one level down, to agents whose entire context is
thrown away; the worker keeps only `file:line` answers and verbatim failure lines. Scout and runner
never nest further.

**Harness mapping** — the roles are generic; each harness names them differently:

| Role | Claude Code | Other harnesses |
| --- | --- | --- |
| Worker | `Agent(subagent_type: "spec-worker", model: <tier>)` — `.claude/agents/spec-worker.md`; `model` per cluster, required | one sub-agent per cluster with the worker payload below; if the harness has no sub-agents, see *Degraded mode* |
| Scout | `Agent(subagent_type: "repo-scout", model: "haiku"\|"sonnet")` — haiku pointed question, sonnet module map; required | the `repo-discovery` skill, run by the worker itself |
| Runner | `Agent(subagent_type: "shell-runner", model: "haiku")` — required | worker redirects output to a file (`cmd > log 2>&1; echo exit=$?`) and reads only the failing slice |
| Verifier | `Agent(subagent_type: "spec-verifier", model: <tier>)` — sonnet, or `"opus"` for critical features; required | one fresh sub-agent with the Verifier payload |
| Concurrency | all clusters of a wave in **one message with N `Agent` calls** (they run concurrently); wait for every notification before the wave gate | dispatch all clusters of a wave at once if the harness allows; otherwise sequentially, still one worker per cluster |
| Resume (fix→re-verify, fix worker) | `SendMessage` to the agent id returned by the original `Agent` call — same context, no re-read; only while that agent is under its ≈120-turn budget | fresh agent with the previous summary/verdict pasted first |

The Claude Code hook `delegate-to-subagent.mjs` **enforces** the discipline inside `spec-worker`
and `spec-verifier` (per-agent quota: six navigation calls for the agent's lifetime, zero heavy
runs) and stays silent inside scout and runner; `subagent-model-required.mjs` enforces the
explicit `model` on every dispatch of the four agents, in the main window and inside nesting
subagents alike. In other harnesses the same rules are text in the worker payload.

**Degraded mode (no sub-agents at all):** say so to the user first, then execute cluster by cluster
in the current window — one cluster at a time, in wave order, still applying the file-ownership,
git and gate rules below, and still running `validate.md` as a fresh-eyes pass at the end. Never
silently fall back.

---

## Waves and clusters

Two units replace the old phase/batch pair:

- **Wave** — a set of clusters that can run **in parallel**: no dependency between them, no file in
  common. Waves run in order; a wave starts only after the previous wave's clusters all reported
  and the wave gate passed. Waves are the barrier.
- **Cluster** — an **ordered** list of tasks handed to **one worker**, executed sequentially. Tasks
  in a cluster share files or depend on each other; a cluster is the unit of context and of commit
  authorship.
- **Exclusive task** — a task that touches something every other task depends on being stable:
  contract regeneration (`pnpm contract`, `openapi.json`, `generated/`), migrations, lockfile or
  root config, rebuilding a shared package's `dist`. It is a **wave on its own** — one cluster,
  one worker, nothing else in flight.

**Inputs** — every task in `tasks.md` carries `Depends on` (task IDs), `Touches` (every file it
creates or modifies, tests included) and `Exclusive` (yes/no). Clustering is only as good as the
`Touches` list; a task that discovers it needs an unlisted file stops and reports (see worker rules).

**Algorithm** (authored in the Tasks phase; re-derived by the orchestrator when the Tasks phase was
skipped and the plan is inline):

1. **Level** — `level(T) = 0` if `T` has no dependencies, else `1 + max(level of its deps)`.
2. **Wave** — one wave per level, in level order. Exclusive tasks leave their level and become a
   wave of their own placed right before the first wave that depends on them.
3. **Cluster within a wave** — tasks that share any file (transitively) form one cluster; tasks
   sharing nothing form separate clusters. Order inside a cluster follows dependencies, then task
   number.
4. **Fold linear chains** — a task `Y` of the next wave joins cluster `C` (appended after its
   dependencies) when **all three** hold: every dependency of `Y` is in `C`; every *other* task that
   depends on those same dependencies is already in `C`; `Y` shares no file with any cluster other
   than `C`. Repeat until nothing folds. This removes barriers that gate a single task without
   ever serialising work that could run beside something else.
5. **Cap** — a cluster should hold **1–5 tasks** (worker context budget). A wave should hold at most
   **4 clusters in flight**; if it has more, dispatch the first four and start the next as each one
   reports (FIFO) — do not merge clusters to fit.

**Objective, in order:** maximise clusters per wave (parallelism), then minimise waves (barriers),
then keep clusters small. When two layouts tie, prefer the one with more clusters in the first
wave — it starts more work sooner.

**Worked example** — 9 tasks:

```
T1 interface (no deps, a.ts)            T6 component  (deps T1, x.tsx)
T2 service   (deps T1, b.ts)            T7 hook       (deps T6, x.hook.ts)
T3 repo      (deps T1, c.ts)            T8 wiring     (deps T2 T3 T7, module.ts, router.tsx)
T4 service+  (deps T2, b.ts)            T9 contract   (deps T8, *.contract.ts, openapi.json — exclusive)
T5 tests-int (deps T4, b.int.spec.ts)
```

- Levels: T1=0 · T2,T3,T6=1 · T4,T7=2 · T5=3 · T8=4 · T9=5
- Wave 1: `C1: T1`
- Wave 2: `C2: T2` · `C3: T3` · `C4: T6` (disjoint files, no deps between them)
- Fold: T4 (deps ⊂ C2, sole dependent of T2, shares `b.ts` only with C2) → `C2: T2 → T4`;
  T5 (deps ⊂ C2, sole dependent of T4) → `C2: T2 → T4 → T5`; T7 → `C4: T6 → T7`. T8 depends on
  three clusters → cannot fold → wave 3. T9 is exclusive → wave 4 alone.
- Result: **4 waves, 6 clusters, 3 workers in parallel in wave 2**, instead of 9 sequential tasks
  or 3 sequential batches.

**Authoring for parallelism** (Tasks phase — this is where clustering is won or lost):

- **One owner per file.** Two tasks editing the same file are one cluster by definition. When a
  file naturally collects many small edits (a NestJS module registering providers, a router, a
  barrel-like index, an FSD slice's `model/`), give the wiring **its own task** at the end of the
  chain instead of letting five tasks each add a line to it.
- **Tests travel with their code** (`Touches` lists the spec file too) — never a shared "tests"
  task that touches every area.
- **Mark exclusivity honestly.** Contract regen, migrations, lockfile, root config, shared `dist`.
  A task that runs `pnpm contract` in the middle of a parallel wave corrupts everyone's typecheck.
- A single cluster of 8+ tasks is an authoring smell: the tasks are coupled through files that
  should have been split, or through a wiring file that should be one task.

**Cross-check (mandatory before presenting `tasks.md` — Check 4 in `tasks.md`):**

| Wave | Cluster | Tasks (order) | Files (union of Touches) | Deps outside earlier waves / own cluster? | Files shared with a sibling cluster? | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | C2 | T2 → T4 → T5 | `b.ts`, `b.spec.ts`, `b.int.spec.ts` | none | none | ✅ |

Any ❌ (a dep on a sibling or later cluster, a shared file, an exclusive task with company) →
re-cluster before presenting.

---

## Light Execute (≤4 tasks)

A plan of **1–4 tasks total** — whether it came from Small/Medium auto-sizing or from a formal
`tasks.md` that turned out to hold ≤4 tasks — skips wave/cluster machinery: **one worker runs the
whole plan, sequentially, as a single cluster.** No formal `tasks.md` is required for this path:
the inline Execution Plan from `implement.md` § 0 is the plan, and the orchestrator records task
status and commit hashes in `.specs/STATE.md` Handoff (and in `tasks.md` too, if one already
exists).

- **One worker**, sonnet by default (*Model selection* above), executes every task in order in one
  dispatch. Per-task cycle is unchanged: tests from the spec → minimal implementation → scoped
  gate through the runner → atomic commit, one task at a time.
- **One Build gate**, run by the orchestrator through the runner **once, after the last task** —
  never per task, and there is no wave to gate per-wave; scoped (typecheck + lint + touched-area
  unit tests) unless the plan touched shared code — the Verifier's Final gate that follows is the
  full run.
- **The Verifier still runs, always**, sonnet by default, opus only per *Model selection*'s P0
  criteria: spec-anchored coverage check + Final gate + a **reduced discrimination sensor**
  (1–2 behavior-level mutants on the riskiest AC, instead of the default 3 / P0 ≥5) + `validation.md`.
- **Exclusive tasks** (contract regen, migrations, lockfile/root config) need no wave of their own
  here: the single worker is already sequential, so an exclusive task mixed with ordinary ones in
  the same ≤4-task plan simply runs in its place in the order — there is no parallel sibling for it
  to corrupt.
- Everything else is unchanged: the orchestrator never implements, file ownership and the git
  protocol apply exactly as in a cluster, the worker never writes to `.specs/`.
- **Safety valve still holds** (SKILL.md § *Auto-Sizing*): 5+ tasks means a formal `tasks.md` and
  the full wave/cluster plan — never a light mode stretched past 4 tasks.

---

## Dispatch protocol (orchestrator, per wave)

1. **Pre-flight (once per feature):** confirm the checkout the workers will use — the feature
   worktree path and branch (medium/large) or the main checkout (small); confirm
   `git status --short` there is clean or only carries files you expect; record the test count the
   Verifier will compare against (via the runner, not inline).
2. **Dispatch the wave:** one worker per cluster, **all in a single message**, each with the worker
   payload below and a **tier chosen for that cluster** (*Model selection*). Up to 4 in flight;
   queue the rest FIFO.
3. **Wait for every summary.** Do not start the next wave, do not run the wave gate, do not touch
   `tasks.md` while a cluster of the wave is still running. A summary carrying a `HANDOFF:` block
   means the worker hit its ≈120-turn budget: re-dispatch a fresh worker of the **same type and
   tier** with that block as the first lines of its payload, unchanged ownership and gates, and
   treat it as the same cluster — the wave is not complete until the continuation reports.
4. **Wave gate:** dispatch the **runner** with the Build-level gate command from `tasks.md`
   (typecheck + lint + the unit tests of the areas the wave touched, path-filtered over the wave's
   `Touches`; the full unit suite only for a wave the Wave Plan marks `gate: full-unit` because it
   touched shared code — domain kernel, module wiring, contract, shared package; a config/docs/CI
   wave gets typecheck + lint only). Never e2e/integration and never the full unit suite otherwise:
   those run once, in the Verifier's Final gate. Runs **once per wave, never per task and never
   inside a worker** — parallel workers each running the suite would fight for CPU and pick up
   each other's half-written specs.
5. **Record:** update `tasks.md` (task status, commit hashes) from the summaries. The orchestrator is
   the only writer of `.specs/` during Execute.
6. **Failure in the wave** (a worker STOPPED, or the wave gate failed) → *Failure handling* below,
   before the next wave.
7. **After the last wave:** dispatch the **Verifier** — always, never prompted — at the tier the
   feature's risk calls for (*Model selection*).

Keep the orchestrator's own turns thin: dispatch messages, summaries, one gate result, one
`tasks.md` update per wave. If you find yourself reading source files to "help", stop — that is a
scout's job at the worker's request, not yours.

**Wave order note:** the wave gate is the moment cross-cluster breakage surfaces (cluster A changed a
type cluster B consumes without depending on it). That is a `Touches`/`Depends on` authoring gap —
fix the code through a fix worker *and* correct the plan so the next feature does not repeat it.

---

## Worker payload

**≤ ~150 words, pointers not content, rules never repeated** — the card is the worker's contract;
a payload that restates ownership, git or gate rules is opus output paid on every later turn of
the orchestrator (measured 2026-08-17: 600–900 words per dispatch, mostly rules already in the
card). Template — fill the brackets, add nothing that does not change the work:

```
Feature <name> — checkout <abs path>, branch <branch>. Cluster C<k> of wave <w>: T<a> → T<b>.
Card first, whole: <skill dir>/references/cards/worker.md. Then, ranged: tasks.md "### T<a>",
"### T<b>", "## Test Coverage Matrix", "## Gate Check Commands"; spec.md ACs <ids>; design.md
§ <section> (if any).
Own: <files>. Siblings in flight: C<j> <files>, C<m> <files>.
Gates: quick `<cmd>`, full `<cmd>` (scoped; no Build gate, no project-wide typecheck).
Tier: <haiku|sonnet|opus> — <reason>. [haiku: surgical edits, no formatter runs.]
[One-line specifics only if they change the work: decision AD-NNN / context.md item / lesson L-NNN.]
Return: compact summary per the card, ≤1.5 kB.
```

Never paste file contents, spec text or rules into the payload. Payloads, summaries and verdicts
are English in both directions, whatever language the user speaks (SKILL.md Critical Rule 6) —
the worker never sees the user.

**Verifier payload — same discipline (≤ ~120 words):**

```
Verify feature <name> — checkout <abs path>, branch <branch>. Card first, whole:
<skill dir>/references/cards/verifier.md. spec.md (ACs + traceability Proof column) is the truth.
Commit range <first>..HEAD. Test files in scope: <list>. Gate Check Commands: tasks.md
"## Gate Check Commands"; pre-feature test count <n>. Light Execute: <yes|no>. P0: <yes|no>.
Tier: <sonnet|opus> — <reason>. Return: compact verdict per the card, ≤1.5 kB.
```

## Worker rules

**Never Read `SKILL.md`, `implement.md`, `sub-agents.md`, `validate.md` whole from a worker or
Verifier — cards first (`cards/worker.md`, `cards/verifier.md`), then ranged sections.**

0. **Turn budget ≈120.** Running out with tasks left is normal on a long cluster, not a failure:
   commit what is green, then close the compact summary with a `HANDOFF:` block naming the tasks
   done, the next task and its `file:line`, decisions already taken and what remains. The
   orchestrator re-dispatches a fresh worker of the same tier with that block pasted first.
1. **Delegate what you would otherwise paste.** Where a symbol lives, who consumes a route, the
   shape of the area you are about to touch → **scout**. Any gate, test, typecheck, lint, build →
   **runner**, which returns exit code + literal failures + log path. Direct `Read` with a known
   `file:line` and a range is always fine; a handful of `grep -n` on files you already know is
   fine; an open question ("where is…", "who uses…") goes to the scout from the first one.
2. **File ownership is absolute.** Only files in your `Touches` union. Need another file → STOP,
   report `blocked-by-ownership` with the file and why. The orchestrator re-plans; you never widen.
   **Reading a sibling's file is unreliable too** — it may be mid-edit; if your task needs what
   another in-flight task produces, that is a missing dependency: STOP and report it the same way.
3. **Never touch `.specs/`.** `tasks.md`, `spec.md`, `STATE.md` are the orchestrator's; you report,
   it records. Never *read* `STATE.md` either — a decision a task depends on is in `design.md`
   (`AD-NNN`) or arrives as one line in the payload.
4. **Per-task cycle from `implement.md`** — assumptions → tests from spec → minimum implementation →
   scoped gate through the runner → adequacy review → atomic commit → next task. A failing gate is
   fixed, never bypassed; a wrong test is reported, never silently changed.
5. **Scoped gates only.** Quick/Full as `tasks.md` says, scoped to the files you touched — the
   test runner only compiles what your tests import, so a sibling's half-written file cannot fail
   you. **Never a project-wide typecheck** (`tsc`/`turbo typecheck` see the whole app and will fail
   on a sibling's work in progress); lint runs on your own files only. Typecheck and Build are the
   orchestrator's, once per wave.
6. **Git protocol for parallel workers** — the checkout is shared with sibling clusters:

   ```bash
   cd <checkout>
   git add -- <your files>
   git commit -m "<type>(<scope>): <description>" -- <your files>
   ```

   The pathspec on `commit` makes it a **partial commit**: only your paths, even if a sibling has
   other files staged at that moment. If git answers `index.lock … File exists`, a sibling is
   committing — wait 2 s and retry (up to 5×). **Forbidden** in a worker: `git add -A` / `git add .`,
   `git commit -a`, `git stash`, `git checkout`/`switch`/`reset`/`rebase`/`merge`/`clean`, any
   branch operation. Before reporting, `git status --short -- <your files>` must print nothing.
7. **Stop early, report exactly.** A failing gate you cannot fix in 3 attempts, a test that
   contradicts the spec, a needed file you do not own, an ambiguity the spec does not settle → STOP
   at that task and report; the remaining tasks of the cluster stay untouched. Never improvise a
   spec decision.

## Compact summary (worker → orchestrator)

```
Cluster C<k> (wave <w>) — DONE | STOPPED at T<n> (<reason: gate-failed | blocked-by-ownership | spec-ambiguity | test-contradicts-spec>)
- T<a>: <hash> — <n> tests, quick gate exit 0
- T<b>: <hash> — <n> tests, full gate exit 0
- Files touched: <list> (all inside ownership)
- Deviations: none | SPEC_DEVIATION in <file:line> — <one line>
- Blocker (if STOPPED): <task> — <failure verbatim, ≤ 10 lines> — log: <path>
- HANDOFF (only if the turn budget ran out): <done> — next <T<n>> at <file:line> — <decisions, what remains>
```

Nothing else: no narrative, no logs, no diffs. **Cap: 1.5 kB.** Every character lands in the
orchestrator's context for the rest of the session, on every turn until it ends; the Verifier's
verdict block obeys the same cap.

---

## Failure handling

| Signal | Orchestrator does |
| --- | --- |
| Worker STOPPED `gate-failed` | **Resume the same worker** (Claude Code: `SendMessage` to its agent id) with the blocker verbatim + log path and the same ownership — it already holds the task's context — while it is under its turn budget; a fresh fix worker only when it is over budget (`HANDOFF:` in its summary) or gone. Second failure at the same tier → re-dispatch **one tier up**, fresh. Bounded to 3 attempts per cluster, then escalate to the user with the failure. |
| Worker STOPPED `blocked-by-ownership` | The plan is wrong, not the worker: add the file to that task's `Touches`; if the file belongs to a sibling cluster in flight, wait for that sibling to finish, then re-dispatch the stopped cluster (it is now the next wave). Correct `tasks.md` so the cross-check holds again. |
| Worker STOPPED `spec-ambiguity` / `test-contradicts-spec` | Do not guess on the worker's behalf. Settle it with the user (or from `context.md`/`STATE.md` decisions if already settled), record the decision, re-dispatch. |
| Wave gate FAIL | Dispatch one fix worker owning the failing area with the runner's literal failures; re-run the wave gate through the runner. Bounded to 3 iterations, then escalate. |
| Verifier FAIL | Ranked gaps → fix tasks (clustered like any other tasks) → workers → **re-verify by resuming the same Verifier** (`SendMessage`: the fix commits' range + which gaps were addressed) while it is under its turn budget — it keeps its evidence file and re-checks only the gap rows, no second Final gate, no new mutants beyond the surviving ones; measured 2026-08-17, a resumed re-verify cost a fraction of a fresh one. Fresh Verifier with the `HANDOFF:` block only when the first is over budget. Bounded to 3 fix→re-verify iterations, then escalate. |
| A worker returns nothing / dies | Treat as STOPPED at its first unfinished task; check `git log` for what it committed before re-dispatching from there. |

Sibling clusters in the same wave are **not** cancelled by one failure — they finish, then the wave
gate waits for the fix.

---

## Verifier

**Always-on, never prompted — one per feature completion.** A fresh sub-agent dispatched by the
orchestrator after the last wave's gate passed. It is not gated behind anything; do NOT ask the user
whether to run validation.

**Author ≠ verifier:** the workers wrote the code and tests; the Verifier does not inherit their
context, mental model or assumptions. That separation is the gate. It runs alone — no worker is in
flight while it runs — so its scratch mutations cannot collide with anyone.

**What the Verifier receives:**

- `spec.md` for the feature (ACs = source of truth) and the checkout path/branch
- The commit range of the feature (first task commit `..HEAD`)
- The test files in scope (from `tasks.md` `Touches`) and the Gate Check Commands
- `references/cards/verifier.md` as its operating contract — read whole, first. `validate.md` is
  the rationale and template layer behind it: read by section (§ 2 spec-anchored check, § 4 Final
  gate, § 5 sensor, § 9 report + template, § 10 lessons), never whole.

**What the Verifier does (full process in `validate.md`):**

1. **Spec-anchored coverage check** — evidence-or-zero: every AC traced to `file:line` + assertion
   expression, and the asserted value matched against the spec-defined outcome; imprecise spec →
   **spec-precision gap**, never a silent pass. Locating assertions is scout work; the Verifier
   keeps the `file:line` answers.
2. **Final gate** — the ONE run of the complete suite (build + lint + all tests incl. e2e/integration)
   in the feature, through the runner.
3. **Discrimination sensor** — injects behavior-level faults, sized by risk (Light 1–2 · default 3
   · P0 ≥5; inject once, run once each) in the real files of the checkout, runs only the scoped
   tests through the runner, confirms they FAIL, then restores each file from HEAD
   (`git checkout -- <file>` — never `stash`, never a branch operation). Surviving mutants → fix tasks.
4. **Payload/conjunction rule** — fields asserted on value/state, not on the call that produced them.
5. **Writes** `.specs/features/[feature]/validation.md` — PASS/FAIL, per-AC evidence, sensor result,
   gate results, commit range. This is the only file it writes; it never edits code or tests.
6. **Distills lessons** from grounded failures via `scripts/lessons.py` (a clean PASS records
   nothing) — see `lessons.md`.
7. **Returns the compact verdict** to the orchestrator:

```
## Validation: [feature] — [PASS ✅ | FAIL ❌]

**Spec-anchored check**: [N/N ACs matched spec outcome | M spec-precision gaps flagged]
**Gate**: [X passed, 0 failed]
**Sensor**: [N mutations injected, N killed, N survived]
**Report**: `.specs/features/[feature]/validation.md`

**Ranked gaps** (if FAIL):
1. [Gap] — [AC or criterion] — [file:line or "no evidence"]
```

The Verifier is the closing step of Execute. Execute is not done until it reports PASS and the
report file exists.
