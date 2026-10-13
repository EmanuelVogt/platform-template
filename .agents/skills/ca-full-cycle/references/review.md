# Review + QA — independent close, human judgement

Two closes, in order: the **Reviewer** (AI, fresh, independent — the last machine check) and
**QA** (the human — the first human contact since the brief). Neither is optional; the Reviewer is
never prompted, QA is never skipped on the pipeline's own judgement.

## 1. The Reviewer — always, fresh, author ≠ reviewer

After the last wave verifier passes, set `Status: Review` in `plan.md` and dispatch ONE fresh
Reviewer. Tier: **high by default** — with
no human plan gate upstream, this is the only deep independent read before a person sees the work;
mid only for a light (≤3-task) non-P0 run. It runs alone, nothing in flight.

```
Review feature <slug> — checkout <abs path>, branch <branch>. Card first, whole:
<skill dir>/references/cards/reviewer.md. research.md (ACs + proofs) is the truth; plan.md
"## Wave Plan" for the task map. Commit range <first>..HEAD. Final gate: `<final cmd>`;
pre-run test count <n>. P0: <yes|no>. Light: <yes|no>.
[Known flaky: <file:line list from worker summaries — evidence from these counts as zero>.]
[Already probed: <per wave: T<n> file:line, killed> — aim the sensor where no verifier looked.]
Tier: <high|mid> — <reason>. Return: compact verdict per the card, ≤1.5 kB.
```

The card holds the process (AC evidence check, self-run Final gate, discrimination sensor,
single write of `review.md`, scope containment). The orchestrator only routes the outcome:

- **PASS with no commit after the Final gate** → non-P0: set `Status: QA` in `plan.md`, go to
  § 2. P0: go to § 1b first.
- **PASS reached after fix rounds** → one closing Final-gate run first (the orchestrator,
  directly, log-on-disk): green → `Status: QA` (P0: § 1b first); red → the failures are new gaps
  and the loop continues (they count toward the 3). Without this, everything committed after the
  last full run ships to the human on a stale green.
- **FAIL** → ranked gaps become fix tasks, clustered and dispatched like any wave (wave verifier
  included, every fix cluster a new `running` row in the Wave Plan), then **resume the same
  Reviewer** with the fix range — it re-checks gap rows only; the closing gate above replaces its
  Final-gate re-run. Bounded to 3 fix→re-review rounds, then escalate with the verdict.
- **A verdict ending in `HANDOFF:` is not final** — dispatch a continuation Reviewer with the
  evidence-file path (card § _Turn budget_); never route a partial verdict to QA.

## 1b. P0 second review — cross-model, read-only (standing user rule, 2026-09-25)

A P0 feature gets a **second independent read by a different model family** between the
Reviewer's PASS and QA — the first Reviewer is fresh but shares the workers' family, and correlated
blind spots survive fresh context. On this machine that harness is **Codex CLI**; any harness whose
model is not the author's family qualifies. It reads and probes, never fixes, never mutates the
tree, never owns the fix loop — the fix loop stays here, with the same Reviewer. One pass per run.

Orchestrator, after the PASS (and after the closing gate when there were fix rounds):

1. Write a `## Handoff` in `plan.md` (implement.md § _Pause / blocked_): `Paused: <date> — P0
second review in <harness>` · `Next: triage review.md "## Second Review" per review.md § 1b`.
2. Tell the user, in their language, that the P0 second review runs in the other harness and
   comes back here for triage; suggest a fresh window. Print ONE ready-to-paste block:

```
Second review (P0, cross-model) of feature <slug> — checkout <abs path>, branch <branch>.
Card first, whole: <abs path>/.agents/skills/ca-full-cycle/references/cards/second-reviewer.md.
Truth: .ca-plans/<slug>/research.md (ACs + proofs). First Reviewer's report:
.ca-plans/<slug>/review.md — re-derive, do not trust. Commit range <first>..HEAD.
Riskiest ACs per the brief: <AC-nn, AC-mm>. Already killed by the sensor: <file:line list>.
You are read-only: append ONE "## Second Review" section to review.md, nothing else on disk,
then print the resume prompt the card ends with.
```

3. On resume: delete the Handoff, read `## Second Review`, triage every finding — one route each,
   logged as one line next to it in `review.md`:
   - **Confirmed defect vs an AC** → gap: fix tasks, wave verifier, **the same first Reviewer
     resumed** on the affected rows (§ 1 FAIL route; counts toward its 3 rounds). The second
     reviewer never re-checks — the closing gate and the resumed Reviewer do.
   - **The brief never promised it** → the § 3 "new or changed behavior" route, or one line in
     `research.md` Out of Scope; never absorbed silently as a fix.
   - **Rejected** → one line with the evidence that refutes it (`file:line`). A rejection with no
     evidence is a confirmation.
4. Then `Status: QA`. Section absent on resume (harness unavailable, user skipped it) → one line
   in `review.md`: `Second review: skipped — <reason>`, and proceed; ask once at most, never block
   QA on it twice. Closeout (§ 4) reports it: `second review: <n> findings / <k> confirmed |
skipped`.

## 2. QA handoff — the human returns

**Agent QA first (standing user rule, 2026-09-25).** Every QA step the orchestrator can execute
itself, it executes before the handoff — real browser (headless Chrome over real markup + built
CSS, or the running app), API calls, DB queries, screenshots it reads back — and records the
evidence in `review.md` § QA Log. The human script keeps ONLY what strictly needs a person: a step
no agent can perform (real device, third-party account, physical world, credentials the agent
lacks) or a subjective acceptance where the user's opinion IS the verdict (look and feel, copy
tone, "is this what I wanted"). Everything the agent proved is shown as one evidence line per AC,
never re-asked. Nothing left for a person → no script: evidence summary + ask for "qa ok".

**Visual acceptance ships as a screenshot, not a step (standing user rule, 2026-09-30).** When
the subjective part is how a screen looks (layout, copy, state rendered), the orchestrator opens
the screen in the headless browser, saves the PNG, reads it back, and hands the user the absolute
path alone on its line, with what to judge in it ("o subtítulo do drawer nomeia o público?") —
the user's verdict is on the image, no navigation asked. A step stays in the script only where a
picture cannot carry the judgement: interaction feel (drag, speed, a long flow), a real device,
or the user's own browser state.

**QA screenshots are desktop only (standing user rule, 2026-10-07).** Shoot at a desktop viewport
(≥1280); no mobile screenshots for QA unless the user asks for them in that feature. Mobile checks
that are not a print (`probe:overflow`, element measurements) still run.

Announce completion in ONE compact block (user's language): what shipped (per AC, one line), the
Reviewer's verdict line, then the **QA script** — generated from the ACs, not from the
implementation:

```
QA — [feature]
Setup: [commands/state needed once, if any]
1. [user action] → expected: [observable outcome]        (AC-01)
2. …
Not in this run: [Out of Scope, one line — resets expectations before they become findings]
Reply "qa ok" to close, or the item numbers that failed + what you saw.
```

Rules: only steps that survive the agent-QA filter above become steps (machine-proved ones — `gate`, internal `test` — are
already evidenced in `review.md`; do not ask a human to re-prove them). All ACs machine-proved,
nothing observable → there is no script: present the per-AC evidence summary instead and ask for
the explicit close — "qa ok" still closes. Steps are concrete actions
with concrete expected outcomes; a step the user cannot execute from the script alone is a bad
step. ≤10 steps — past that, group by flow.

## 3. Correction loop — triage every finding, one route each

| Finding                                                   | Route                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Broken vs. an AC** (the brief promised it, it fails)    | Fix task(s) → worker (resume the owning one) or inline if trivial, every fresh fix cluster a new Wave Plan `running` row → wave verifier on the fix → resumed Reviewer re-checks the affected AC rows → re-issue only the affected QA steps.                                  |
| **New or changed behavior** (the brief never promised it) | Delta research: 1 round of grill questions max → append D-nn / AC-nn to `research.md` → mini-plan (usually ≤3 tasks, light path) → implement → Reviewer resumed on the new ACs. Never absorb it silently as a "fix" — it is scope, and it gets the same machinery scope gets. |
| **Works as specified but the user dislikes it**           | Show the AC + `review.md` evidence in one line; the user chooses: keep, or route as a change (row above). Never relitigate silently, never defend the code.                                                                                                                   |

Fix machinery inherits every Implement rule (bounded 3 attempts per fix, tier escalation, git
protocol). QA rounds themselves are unbounded — the human closes the loop, not a counter. Log each
round in `review.md` under `## QA Log` — one line per finding, in the § 3.5 marker format,
orchestrator writes it.

## 3.5. QA retro — every escaped bug leaves a guard

A finding from § 3's first row (broken vs. an AC) that shipped through Implement and Review is an
**escaped bug**: the pipeline had two machine checks and missed it. Its fix is not closed until
the retro closes — three outputs, written with the fix, never deferred:

1. **Root cause, one line** — the pattern, not the instance.
2. **A guard, on the highest layer the pattern admits** — `type` (the compiler forbids it) >
   `test` (regression in the fix commit) > `static-guard` (a check-script rule) > `tripwire` (a
   one-line rule re-read every session) > `lesson` (nothing automatable — the entry says why).
   The guard lands in the same fix cluster as the fix itself.
3. **A ledger line** in `.ca-plans/LESSONS.md` (format in SKILL.md § *.ca-plans Structure*). A
   recurring pattern is never a new line — increment its `hits` and escalate per SKILL.md.

Findings routed as scope (§ 3 row 2) or preference (row 3) take no retro. Every QA Log finding
line carries a closing marker:
`- F<n> · round <k> · <finding> · <route + fix commits> · → <L-nn | brief-error | preference>`.
A `Status: Done` with an unmarked finding line is an unfinished retro — the `qa-retro-ledger.mjs`
hook blocks it.

## 4. Closeout — on "qa ok"

1. Any fix commit since the last full-suite run → ONE closing Final gate (log-on-disk); red →
   back to § 3, the finding is real.
2. `plan.md` header → `Status: Done`; `review.md` QA Log closed with the final round, every
   finding line carrying its § 3.5 marker.
3. **Run report** — append one entry to `.ca-plans/RUNS.md` from what the run already recorded
   (wave-row metrics + `Started:`); a number the harness never surfaced is `n/a`, never invented:

   ```
   ## <slug>[ · plan-NN] — Done <date>
   Wall: <start> → <end> (<duration>) · waves <n> · clusters <n> · tasks <n> · fix rounds <n> · QA rounds <n>
   Sub-agents: <k> dispatches — low <n> (~<tok>) · mid <n> (~<tok>) · high <n> (~<tok>)
   Main window: <tok | n/a> · Est. cost: ~$<x> [est — from current public prices]
   [P0: Second review: <harness> — <n> findings / <k> confirmed | skipped — <reason>]
   ```

4. Segmented run (`research.md` § Segments): mark this segment's line, then author the next
   segment's plan (plan.md § 0) — the confirmed brief is the standing authorization; the next
   human contact is that segment's QA.
5. One closing line: commit range, AC count delivered, anything consciously left in Assumptions or
   Out of Scope that the user may want as a next run.

Nothing moves, nothing renames. Merging/pushing stays the user's call — finished work is not
permission to push (offer only if the project's own flow says so). Once the merge lands — by
the user, or by you on their word — close the checkout in the same turn: `git worktree remove
.worktrees/<slug>` and delete the local branch (dev-workflow skill § A branch is only born inside a
worktree).
