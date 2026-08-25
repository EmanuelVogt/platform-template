# docs-audience-contract Validation

**Date**: 2026-08-25
**Spec**: `.specs/features/docs-audience-contract/spec.md`
**Diff range**: this feature's 20 listed commits (254dbd4 plan .. df49bc7 spec close-out), HEAD = `df49bc7`
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `aea599b` |
| T2   | ✅ Done | `aaa203d` |
| T3   | ✅ Done | `89c165f` — deliberately kept `.worktrees/<slug>` in the shipped doc (correction 3) |
| T4   | ✅ Done | `2f3ac8d` |
| T5   | ✅ Done | `6dd7c14` |
| T6   | ✅ Done | `44f53d6` |
| T7   | ✅ Done | `203f448` — `/docs/platform` anchored, per-file entry dropped |
| T8   | ✅ Done | `df41664` — shipped set 663/1551, floor 500 asserted |
| T9   | ✅ Done | `83cd9fc` |
| T10  | ✅ Done | `2629248` |
| T11  | ✅ Done | `79d17e9`, `2e0c31d` |
| T12  | ✅ Done | `95b02b0` (+ close-out `5d86d8b`) |

Regression repair `68f01d1` and out-of-feature `a2716e7` are recorded in Execution Record, not counted as feature tasks.

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AUD-01 | `_exclude` carries `/docs/platform`; empty/absent dir fails loudly | `docs-audience-contract.test.mjs:54-64` — `assert.ok(readExcludes().includes("/docs/platform"))` + `assert.ok(trackedUnder("docs/platform").length>0)` | ✅ PASS |
| AUD-02 | no `docs/` `_exclude` entry names a single file | `docs-audience-contract.test.mjs:66-85` — per entry: no tracked path equals the entry, entry matches ≥1 tracked file | ✅ PASS |
| AUD-03 | shipped set: 0 files under `docs/platform/`, every other `docs/` file present | `docs-audience-contract.test.mjs:87-110` — `assert.deepEqual(underPlatform, [])` / `assert.deepEqual(missing, [])` | ✅ PASS |
| AUD-04 | no tracked file outside `.specs/` references a moved doc's old path | `docs-audience-contract.test.mjs:112-146` — old path absent, new path present, `referencing.filter(not-historical) === []` (blast radius pinned to the 2 named historical records) | ✅ PASS |
| AUD-05 | guard fails when a shipped doc names an absent path | `docs-shipped-paths.test.mjs:31-42` (live tree, findings=[], anti-vacuous `shippedDocs().length>20`) + fixture failure `:44-48` | ✅ PASS |
| AUD-06 | guard fails on inline-code token = excluded workflow stem | `docs-workflow-names.test.mjs:48-66` — 3 spellings fail, false-positive guard (`catalog/`, `pnpm catalog:lint`) passes; live tree green `:122-127` | ✅ PASS |
| AUD-07 | failure message names `file:line` and token | `docs-shipped-paths.test.mjs:51-59`, `docs-workflow-names.test.mjs:68-76` — literal `assert.equal(finding.message, "docs/fixture.md:3 — ...")` | ✅ PASS |
| AUD-08 | shipped set/stems recomputed from `copier.yml`, never embedded | `shipped-set.test.mjs:21-43` (mutate excludes → set changes) + `docs-workflow-names.test.mjs:31-46` (remove entry → stem drops) | ✅ PASS |
| AUD-09 | shipped workflow doc carries none of: release dispatch, `.worktrees` shared-checkout rule, no-PR policy, `origin/main` anecdote | `docs-audience-contract.test.mjs:152-167` — 4 real literals from `docs/platform/workflow.md` (`release.yml`, `shared between agents`, `pull request`, `origin/main`) asserted absent; boundary `:183-187` protects the kept `.worktrees/<slug>` convention. Mutation-confirmed (sensor #3). | ✅ PASS |
| AUD-10 | the 4 mechanics live under `docs/platform/`, that file unshipped | `docs-audience-contract.test.mjs:169-178` — same 4 literals asserted present + `!shippedSet().has("docs/platform/workflow.md")` | ✅ PASS |
| AUD-11 | every `docs/agents/README.md` table row resolves in shipped set | `docs-audience-contract.test.mjs:189-207` — rows parsed from the table (≥5), each resolved path asserted in `shippedSet()` | ✅ PASS |

**Status**: ✅ All ACs covered — 11/11, no spec-precision gaps.

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `scripts/platform/__tests__/lib/audience-contract.mjs:83-85` | Collapsed the anchored/unanchored branch of `excludeMatcher` so `/catalog` also matches `docs/catalog/**` (no anchor) | ✅ Killed — `node --test shipped-set.test.mjs`: "not ok 3 - uma barra ancora na raiz…", 1 fail |
| 2 | `scripts/platform/__tests__/lib/audience-contract.mjs:179` | Widened `EXEMPT_DOC_PREFIXES` from `[".agents/skills/"]` to `[".agents/"]` | ✅ Killed — `node --test docs-shipped-paths.test.mjs`: "not ok 11 - a isenção por prefixo cobre .agents/skills/ e nada além dele", 1 fail |
| 3 | `docs/agents/workflow.md` (shipped) | Reintroduced the `origin/main` staleness anecdote into the shipped workflow doc | ✅ Killed — `node --test docs-audience-contract.test.mjs`: "not ok 5 - AUD-09: o doc de workflow entregue não carrega nenhuma mecânica só do template", 1 fail |

**Sensor depth**: default (3) — not P0, not Light Execute.
**Result**: 3/3 killed — ✅ PASS. All mutants restored (`git checkout --`); `git status --short` on the three touched files confirmed empty after each.

---

## Gate Check

- **Gate command**: `pnpm format:check && pnpm check && pnpm test && pnpm test:scripts && pnpm template:smoke` (tasks.md Final row)
- **Result**: `format:check` ✅ · `check` ❌ (chain stopped) · `test` not reached · `test:scripts` ✅ 681 passed, 0 failed (run standalone after the chain stopped) · `template:smoke` ❌ 7 (run standalone)
- **Test count before feature**: 630 (`pnpm test:scripts`, at `aae08e6`)
- **Test count after feature**: 681 (`pnpm test:scripts`), matches wave 3's own measurement exactly — no drop
- **Delta**: +51 (includes parallel-session commits sharing this checkout, per Execution Record wave-1 note)
- **Failures**:
  - `pnpm check` fails at `api#typecheck`: 5× `TS2554` in `apps/api/src/shared/infra/storage/null-storage.adapter.spec.ts`. **Root cause traced outside this feature**: that file's last touching commit is `d5cfcaf feat(api): provider-neutral STORAGE_* keys and a null storage adapter`, absent from this feature's 20-commit list; `apps/**` is explicitly outside this feature's diff surface (Gate Check Commands note: "every wave here touches only `docs/**`, `scripts/platform/__tests__/**`, `copier.yml` and `.claude/hooks/**`"). HEAD (`df49bc7`) is this feature's own last commit, confirming no feature commit touches `apps/api`. This is shared-checkout pollution from a different, concurrently in-flight feature (the "testing barrels" / `test-suite-refactor` work visible in recent repo history), not a defect of `docs-audience-contract`.
  - `pnpm template:smoke` fails for the identical reason: the rendered child copies `apps/api` as-is, so `pnpm check` inside the child hits the same `api#typecheck` error (exit 7, "template:smoke — 'pnpm check' falhou no child"). Not a failure of the `_exclude`/shipped-set mechanism this feature builds — nothing in the smoke log implicates `docs/**`, `copier.yml`'s `_exclude`, or the audience-contract guard.
  - The two commands this feature's own proof depends on (`pnpm test:scripts`, all 11 ACs' declared proof) are green with no drop; `pnpm check`/`pnpm template:smoke` are blocked by an external, pre-existing defect.
- **Per the process rule** ("Non-zero exit code = STOP"), the Final gate as declared is not green, so overall status is FAIL even though every AC and the sensor are clean. Code Quality Check (step 6) was not run, per that rule.

---

## Summary

Spec-anchored coverage is complete and evidenced: 11/11 ACs have `file:line` assertions checking the actual asserted value, including the three flagged scrutiny points (T8's matcher/floor, the two exemptions' blast radius, and the AUD-09/10 four-literal set) — all mutation-confirmed to bite. The discrimination sensor is 3/3 killed. The Final gate is blocked by a pre-existing, unrelated `apps/api` typecheck defect (traced to commit `d5cfcaf`, outside this feature's diff surface) that also breaks `template:smoke`'s rendered child. This is a real blocker for merge/release but not a defect introduced by `docs-audience-contract`; recommend re-running the Final gate once the `apps/api` storage-adapter typecheck is fixed (a different feature's responsibility) rather than opening a fix task against this feature.
