# Audit 2026-08-23 Remediation — Validation (`v2.4.0` scope)

**Feature**: audit-2026-08-23-remediation
**Spec**: `.specs/features/audit-2026-08-23-remediation/spec.md`
**Verifier**: independent sub-agent (author ≠ verifier), opus tier, P0 depth
**Scope**: the 43 requirements named by `tasks.md` § *Task Breakdown — `v2.4.0`* (T1–T48). The 8
`v3.0.0` requirements (BRAND-01, BRAND-02, TZ-01, SEAM-05, SEAM-06, IDENT-01..03) are unstarted by
design and were **not** judged — the release boundary is binding.

| Round | Date | Range | Verdict |
| --- | --- | --- | --- |
| 1 | 2026-08-24 | `92b4120..0422727` | ❌ FAIL — 2 blockers, 5/6 sensor |
| 2 | 2026-08-24 | `ac679f5..a0584f3` (13 fix + 3 spec commits) | ✅ PASS — 0 blockers, 7/7 sensor |
| 3 | 2026-08-25 | `bb65eb0..6813df7` (GT1–GT7) — **post-hoc, `v2.4.0` already tagged** | ✅ **PASS** — 6/6 sensor, 1 process finding |

**Current verdict: ✅ PASS.** 41/43 requirements fully covered with `file:line` evidence; the 2
remaining are CAT-05 (owner-gated, not a code gap) and TOOL-12 (spec-adjudicated "half-refuted").
Round 3 additionally confirms LOC-03, LOC-06 and SEAM-04 now hold on the `web_stack=next` shell,
closing the cross-feature Fix 5.

**Qualification on round 2.** Between fix round 1 and GT7 (`a77d17c`), the two guards that closed
round 2's blockers — `brand-hygiene.test.mjs` and `locale-threading.test.mjs`, 15 tests — could not
execute in CI: `copier` was provisioned only in the `catalog` and `smoke` jobs. My round-2 Final
gate was green only because my workstation carries Homebrew `copier` 9.17.2, outside any
repo-managed toolchain. The assertions were sound; the enforcement was absent. See Round 3, Q1–Q4.

---

# Round 3 — post-hoc review of what shipped in `v2.4.0`

**Diff range**: `bb65eb0..6813df7` · GT1–GT7 · **already tagged**: `v2.4.0` was cut from `6813df7`
on gates alone, after the round-2 PASS. This pass is not gate-keeping; it records what went out.

**Instrument note (deliberate).** I did **not** re-run the workstation Final gate. The defect this
round is about is precisely that a workstation gate over-reports; CI at `6813df7` (all 8 release
jobs green, including the five `catalog:check` entries) is the stronger instrument for a shipped
tag. What CI could *not* tell me — the exact blast radius of the copier gap — I measured directly
by hiding the binary (probe P1 below).

## The copier-provisioning gap — my judgement

**Reproduced.** With `/opt/homebrew/bin` stripped from `PATH` at HEAD:
`pnpm test:scripts` → exit 1, **`# tests 605 · # pass 590 · # fail 15`**. Exactly the coordinator's
15, and the failing set is **the entirety of two files**, not a subset:

- `brand-hygiene.test.mjs` — tests 64–72, **all 9**, including the four self-tests
  (`o termo excluído "preservar" não dispara`, the three brand-token self-tests) that need no
  copier at all. They die with the file because `test.before()` renders the child.
- `locale-threading.test.mjs` — tests 369–374, **all 6**, including the three pure file-read
  assertions (`AGENTS.md.jinja interpolates product_locale`, `code-quality.md's and
  communication.md's language rules point at AGENTS.md`, `issue-tracker.md.jinja stops hardcoding
  pt-BR (LOC-01)`).

**Q1 — does it invalidate round-2 evidence beyond those 15 tests? No, but it invalidates a claim
I made.** The other 590 tests are copier-independent and ran identically in CI, so the evidence for
the other 41 requirements stands unchanged. What does not stand is a sentence from my round-2
report: *"the pattern that let round 1's mutant survive cannot recur."* That was true of the
repository and false of the pipeline. Both round-2 blocker closures — Fix 1 (the hygiene gate) and
Fix 2 (LOC-01) — were **100% dark in CI**, not partially, for the whole window between the fix
round and GT7. The assertions I certified were real and discriminating; their *enforcement* was
absent. A regression in either would have reached the tag. It did not, but nothing was watching.

**Q2 — is anything else green-dependent on an unprovisioned local tool? No.** Audited
systematically: `renderChild` (`lib/child.mjs:36-54`) takes an **injectable `run`**, so of the seven
test files that reference it only two invoke the real binary — `brand-hygiene.test.mjs:165` and
`locale-threading.test.mjs:29`; the other five stub the exec. The only other external binaries
reached from the script tests are `git` and `sh` (both always present). `docker` is needed by
`template:smoke` and `catalog:check`, which run only in jobs that already provisioned copier, on
`ubuntu-latest` where docker is present. `rg` and `gh` are stubbed. The blast radius is exactly
those two files, and GT7 closes it.

**Q3 — a residual risk nobody has flagged.** GT7 provisions with `- run: pipx install copier`,
**unpinned**, in `ci.yml:132` and `release.yml:50`. But this repo's `_tasks` guard semantics were
derived *empirically* from one copier version — `copier-questions.test.mjs:78` states
*"verificado empiricamente com copier 9.17.2 — `_apply_update` chama `run_copy` três vezes por
`copier update`"*, which is the whole basis of TOOL-13. My workstation is pinned at 9.17.2 by
Homebrew while CI now floats. The two instruments can diverge again, in the opposite direction, and
a copier major changing `_copier_operation` semantics would break TOOL-13's guarantee in a child
with every gate green. **Recommend pinning (`pipx install 'copier==9.17.2'`) and asserting the pin
in the GT7 guard.** Minor, follow-up, not a blocker.

**Q4 — the process finding.** The Verifier's Final gate runs on the workstation by construction, so
it is *structurally incapable* of detecting a provisioning gap — the exact class of defect that
shipped here. Only CI can. The cheap countermeasure is what I did in one command: when a round adds
a test that shells out to an external binary, re-run the suite with that binary hidden.

## What GT1–GT6 delivered

| Item | Verdict | Evidence |
| --- | --- | --- |
| **LOC-06 on `web_stack=next`** | ✅ met | `apps/web-next/public/favicon.ico` is **byte-identical** to the Vite shell's (md5 `563abc664dca79dd4f09faa8d6b5350a`, 137 B both) — GT1's "ship the favicon the Vite shell already ships" is literally true. Wired at `root-layout.tsx:31` `icons: { icon: "/favicon.ico" }`. The Vite shell needed an nginx `location = /favicon.ico` block because its SPA fallback would swallow the request; the App Router has no such fallback and serves `public/` at the root, so the absence of an nginx-equivalent assertion is a real difference in mechanism, not a gap. Guarded by `next-shell-seam-parity.test.mjs:21-38` |
| **LOC-03 on `web_stack=next`** | ✅ met | `root-layout.tsx:14,18` — `process.env.NEXT_PUBLIC_APP_NAME ?? "Platform"` / `NEXT_PUBLIC_LOCALE ?? "pt-BR"`; `:27` `title: { default: appName, template: \`%s · ${appName}\` }`; `:36` `<html lang={resolveLocale()}>`. Next's `title.template` composition reproduces the Vite `pageTitle("Início") → "Início · Platform"` shape. Build-time inlining of `NEXT_PUBLIC_*` matches Vite's `import.meta.env.VITE_*` — same semantics, so parity holds and the AC ("a product **sets** the vars") is satisfied on both. `.env.example` documents both with defaults equal to the code fallbacks, so no shipped string moves |
| **SEAM-04 on `web_stack=next`** | ✅ met | `routes.ts:30-32` `registerProtectedRoute` adds to `PROTECTED_ROUTES`; consumed by `last-location.ts:10,17,24` (`toSafeProtectedRoute`) and `auth-redirect.ts:14` (`redirectIntent`), with the tracker wired at `last-location-tracker.tsx:15`. Both consumers the AC names are reached. `routes.test.ts:48-63` registers `/produto/painel` and asserts both resolvers pick it up |
| **GT5 — `booking` exception removed** | ✅ confirmed | `docs/dev/template-changelog.md` now has **zero** `booking` hits; `KNOWN_EXCEPTIONS:75-77` is back to `["Cloudflare", "Traefik"]`, so the file is fully domain-scanned. `:515`'s `attends_guests` proven not to match: `/\bguests?\b/i.test("...attends_guests...")` → `false` (no word boundary after `_`), while `"the guests arrive"` → `true`. My round-2 caveat is closed, and wave-7's reword precedent won over wave-6's except precedent — the right call |
| **GT6 — REL-04 both old callers unchanged** | ✅ confirmed | `release-preflight.mjs:98` `currentState = currentStateFromEnv()`; `:83-85` returns `"head"` when the env var is unset **or empty**. In head mode the git args are `["diff","--quiet",previousTag,"HEAD","--",relDir]` and the version ref is `"HEAD"` — **byte-identical to the pre-GT6 implementation** I read in round 1. Neither `lib/lint.mjs:231` nor `release-preflight.mjs:119` passes `currentState`, so both inherit the default. `lefthook-local.yml` sets the env only on pre-commit |

## Discrimination Sensor — round 3

| # | Target | Mutation | Gate | Killed? |
| --- | --- | --- | --- | --- |
| P1 | environment | `/opt/homebrew/bin` stripped from `PATH` (removes `copier`) | `pnpm test:scripts` → exit 1, 590/605, 15 failures in exactly 2 files | ✅ detected |
| 2 | `apps/web-next/src/_app/layout/root-layout.tsx:36` | `<html lang={resolveLocale()}>` → `<html lang="pt-BR">` | `root-layout.test.tsx` exit 1 **and** `next-shell-seam-parity.test.mjs` exit 1 | ✅ Killed (twice) |
| 3 | `apps/web-next/src/shared/config/routes.ts:31` | `registerProtectedRoute` body → `void template` (no-op seam) | `routes.test.ts` exit 1 | ✅ Killed |
| 4 | `apps/web-next/public/favicon.ico` | Deleted the shipped asset | `next-shell-seam-parity.test.mjs` → `not ok 1 - both shells ship a non-empty …/favicon.ico` | ✅ Killed |
| 5 | `release-preflight.mjs:84` | Collapsed the two modes — unset env now yields `"staged"` instead of `"head"` | `entry-bump-lint.test.mjs` exit 1, 2 failures | ✅ Killed |
| 6 | `.github/workflows/ci.yml:132` | Removed `- run: pipx install copier` before `pnpm test:scripts` | `workflow-copier-provisioning.test.mjs` → `not ok 1 - GT7: todo job … provisiona copier antes dele` | ✅ Killed |

Each injected once, run once, restored with `git checkout -- <file>`, `git status --short` empty
before the next. **Result: 6/6 — ✅ PASS.** Mutation 5 is the one the coordinator asked for
specifically: collapsing the modes is exactly the invisible regression GT6 risked, and the head-mode
callers notice.

**Cumulative across three rounds**: 19 injected, 18 killed; the single round-1 survivor died in
round 2.

## Round-3 verdict

**✅ PASS, with the shipped tag qualified.** GT1–GT6 are correct and discriminating; the Next-shell
seams are genuinely new code and all three ACs hold on that shell. The tag itself is sound — CI at
`6813df7` is green on all 8 jobs *with* copier provisioned, so `v2.4.0` was verified by the
pipeline before it shipped, not only by a workstation.

What is qualified is my **round-2 PASS**, not the release: for the window between the fix round and
GT7, the two guards that closed round 2's blockers could not execute in CI. Nothing regressed, but
the assurance I reported was stronger than the assurance that existed.

Open follow-ups: pin copier in both workflows and assert the pin (Q3); CAT-05's `catalog/*` tags;
TOOL-12's declared half-refutation.

---

# Round 2 — fix round 1

**Diff range**: `ac679f5..a0584f3` · FT1–FT13.

## Requirements that moved

| Req | Round 1 | `file:line` + assertion that moved it | Now |
| --- | --- | --- | --- |
| LOC-01 | ❌ FAIL (`issue-tracker.md.jinja:21` hardcoded `**pt-BR**`) | FT9 `8ea4a96`. `locale-threading.test.mjs:106-118` — `assert.doesNotMatch(source, /pt-BR/, "the literal locale must be gone")` + a positive assertion the file points at the canonical rule; `:119-123` renders at `product_locale=en` — `assert.match(content, /user-facing errors en\./)`, `/answer the user in en,/`; `:125-129` renders at the copier default with the key **unset** — `/user-facing errors pt-BR\./`, `/answer the user in pt-BR,/`. All four LOC-01 files covered, two by render | ✅ PASS |
| RUN-02 | ⚠️ no assertion | FT3 `cfaa67d`. `redis-credential-match.test.mjs:28-33` — parses the password out of `.env.example`'s `REDIS_URL` and out of `docker-compose.yml`'s `--requirepass`, then `assert.equal` between them (cross-file derivation, no hardcoded literal) | ✅ PASS |
| BRAND-06 | ⚠️ compose + entrypoint unscanned | FT2 `f25c6d7`. `legacy-backfill-scan.test.mjs:42-47` — `assert.deepEqual(backfillHits(read("docker-compose.yml")), [])` and the same for `apps/api/docker-entrypoint.dev.sh`; `:33-40` is an explicit non-vacuity self-test | ✅ PASS |
| LOC-02 | ⚠️ no assertion | FT4 `6642416`. `locale-convention-reference-set.test.mjs:19-38` — `testing.md`, `adr/README.md`, `advisories/README.md` each `assert.match`ed as deferring to the canonical rule instead of restating a locale | ✅ PASS |
| LOC-06 | ⚠️ no assertion | FT5 `0af4f1f`. `favicon-route.test.mjs:30-40` — asserts `nginx.conf` answers `/favicon.ico` with the static asset and `assert.doesNotMatch` on the SPA fallback. This is the AC's actual wording, stronger than the "asset exists" check round 1 asked for | ✅ PASS |
| SEAM-07 | ⚠️ no assertion | FT6 `a78f80b`. `ownership-table-seams.test.mjs:19-50` — `main.ts` as platform-owned, `bootstrap.product.ts` as the boot seam, plus the three web seams from T25/T26 | ✅ PASS |
| TOOL-09 | ⚠️ no assertion | FT7 `ae02a10`. `workflow-doc-pipeline-parity.test.mjs:19-25` — `assert.doesNotMatch` on `testRegex`; `:48` — `assert.deepEqual(commandKeys, ["migrations","typecheck","test-coverage"])` derived from `lefthook.yml`; `:57-65` — every CI job the doc names must be a real job key in `ci.yml` | ✅ PASS |
| TOOL-10 | ⚠️ no assertion | FT8 `b69eb3a`. `dev-platform-matrix.test.mjs:19-33` — identical matrix asserted in `README.md.jinja`, `local-environment.md`, `TEMPLATE.md`, naming `sync-agent-skills.mjs`; `:35-47` — the same matrix in `copier.yml`'s `_message_after_copy`. All four AC sources | ✅ PASS |
| BRAND-03 | ⚠️ placeholder + closed-list rule unasserted | FT10 `4dadc14`. `issue-tracker-labels.test.mjs:26-32` — the placeholder is discovered with `gh label list`, not reused from the file; `:34-39` — `assert.match(text, /Three axes, all closed lists/)`, `/\*\*Area\*\* \(one per issue, closed list\)/`, `/None fits → issue with no area label/`; `:41-57` — the illustrative line must contain `` `Billing` `` and `assert.doesNotMatch` against every owner domain term | ✅ PASS |
| SEAM-03 | ⚠️ "no edit" claim was prose only | FT11 `6e17d14`. `seam-no-edit.test.mjs:41-49` — the identity entry ships no file named `shell.tsx`/`main.tsx`/`app-providers.tsx`; `:51-63` — `webRootFor` always resolves under `apps/web/src/entities/<name>`, never at a seam file; `:81-87` — anti-vacuity guard against an empty-directory false pass. Static proof accepted: a real `module add` costs minutes and the structural claim is what the AC states | ✅ PASS |
| TOOL-07 | ⚠️ handbook half unguarded | FT12 `41e1e83`. `hook-references.test.mjs` — new `no handbook names a conformance spec or helper that does not exist (TOOL-07)` test walking `docs/**`. `HANDBOOK_EXCLUDED:16-20` = `ADV-*.md`, `template-changelog.md`, `docs/adr/**` (all historical or child-layout); `KNOWN_HANDBOOK_EXCEPTIONS:26-31` = exactly one entry, the YAML schema placeholder `docs/advisories/README.md` → `path/to/the.parity.spec.ts`. `docs/agents/**`, `docs/arch/**`, `docs/test/**`, `docs/code-quality.md` stay live — the guard is not gutted | ✅ PASS |

## Fix 1 (Blocker) — resolved, and the exception judged

FT1 `be83c29`. The end-to-end loop was refactored into a shared `violationsIn()` helper
(`brand-hygiene.test.mjs:135-158`) called by **both** the end-to-end test (`:217-224`) and a new
seeded-mutant test (`:226-245`); the helper's own comment states the shared path is deliberate so
the Verifier's mutant cannot survive one while dying on the other. `violationsIn` now calls
`withoutKnownExceptions(domainHits(text), rel)` — the missing call. The new test loops all five
nouns and asserts a violation names each.

**Judgement on the `KNOWN_EXCEPTIONS` addition — ACCEPTED.** FT1 added `"booking"` for
`docs/dev/template-changelog.md:67`, whose text is *"the identity entry's prose is retired of
booking-specific vocabulary"*. Verified independently:

- It is that file's **only** domain hit. Line 515's `attendsGuests` / `attends_guests` does not
  match `/\bguests?\b/i` — there is no word boundary after `s` or `_`, so the exception is not
  masking a second leak.
- The sentence is meta-prose about the template's own history, not the pilot's domain being
  modelled in a client's product. The exception is scoped to one file **and** one term.

**Caveat (Minor, non-blocking).** Wave 7 deviation 2 set the opposite precedent inside this very
feature: when the gate rejected `MySQL` in T48's changelog draft, the worker **reworded** rather
than excepted. The changelog gains a section per release, so a term-level exception on it is a
slowly widening blanket. Follow-up for the owner: reword `:67` to "the pilot's business
vocabulary" and drop the exception. FT1 could not do it — the file is outside its `Touches`.

## FT13 — the guard's first live catch

`bace8cc`. FT12's new handbook walk surfaced two pre-existing stale references. The real one,
`docs/test/testing.md` naming `scripts/lessons.py`, is fixed to
`.agents/skills/tlc-spec-driven/scripts/lessons.py` (verified: the file exists at that path) and
its exception removed. `docs/advisories/README.md:20` stays excepted as a YAML schema placeholder.
A guard catching a genuine defect on its first run is the strongest evidence it discriminates.

## Discrimination Sensor — round 2

**Sensor depth**: P0-full. Every worker's claim to have "hand-reverted the shipped outcome and
watched it go red" was spot-checked by re-injecting that revert independently.

| # | Target | Mutation | Scoped gate | Killed? |
| --- | --- | --- | --- | --- |
| 6′ | `.github/workflows/ci.yml` (seeded) | **Round 1's surviving mutant, re-run verbatim**: `# Fluxo de Hospedes e Reservas: agendamento de quartos para os guests.` | `brand-hygiene.test.mjs` → exit 1, `.github/workflows/ci.yml carrega vocabulário de domínio do piloto: Hospedes, agendamento, quartos, guests, Reservas` | ✅ **Killed** (survived in round 1) |
| 7 | `apps/api/.env.example:49` | `REDIS_URL` password `redis` → `wrongpass` | `redis-credential-match.test.mjs` → exit 1, 1 failure | ✅ Killed |
| 8 | `apps/api/docker-entrypoint.dev.sh` | Reintroduced `if [ "$RUN_BACKFILL" = "true" ]; then node dist/legacy-import/run; fi` | `legacy-backfill-scan.test.mjs` → exit 1, 1 failure | ✅ Killed |
| 9 | `lefthook.yml:8` | Pre-push step `typecheck:` renamed → doc no longer matches the real chain | `workflow-doc-pipeline-parity.test.mjs` → exit 1, `commandKeys` deepEqual diff | ✅ Killed |
| 10 | `apps/web-vite/nginx.conf:37` | Deleted the `location = /favicon.ico` block (falls through to the SPA) | `favicon-route.test.mjs` → exit 1, 1 failure | ✅ Killed |
| 11 | `docs/agents/issue-tracker.md.jinja:21` | Reverted FT9 — restored the hardcoded `**pt-BR**` line | `locale-threading.test.mjs` → exit 1, 2 failures, `error: 'the literal locale must be gone'` | ✅ Killed |
| 12 | `docs/test/testing.md:24` | Reverted FT13 — restored the stale `scripts/lessons.py` path | `hook-references.test.mjs` → exit 1, `not ok 3 - no handbook names a conformance spec or helper that does not exist (TOOL-07)` | ✅ Killed |

Each mutation was injected once, run once, restored with `git checkout -- <file>`, and
`git status --short` confirmed empty before the next. No `stash`, branch or worktree.

**Result**: 7/7 killed — ✅ PASS. The workers' hand-revert claims hold.
**Cumulative across both rounds**: 13 injected, 12 killed, and the single round-1 survivor is now
dead.

## Gate Check — round 2

- **Gate command**: `pnpm check && pnpm test && pnpm test:scripts && pnpm test:coverage &&
  pnpm catalog:lint && pnpm catalog:typecheck && pnpm catalog:check && pnpm template:smoke`
- **Result**: 8/8 steps **exit 0**
- `pnpm test` 620 tests / 90 files · `pnpm test:scripts` **592/592** (was 561 — **+31** from the fix
  round) · `pnpm test:coverage` 760 tests / 105 files
- **Coverage**: statements 96.51% (1275/1321) · branches 94.42% (627/664) · functions 94.93%
  (375/395) · lines 96.81% (1216/1256) — all ≥ 90, no violation
- **Test count**: 930 pre-feature → 1181 (round 1) → **1212** (round 2). No drop at any point
- **Failures**: none

**Working-tree caveat.** The checkout again carried a concurrent session's uncommitted files (its
earlier `.specs/features/done/**` renames are now committed; other `handoff-archive.md` files are
dirty). They are **not** this feature's; I neither staged nor reverted them. All 8 steps were green
regardless, and no finding in this round derives from them — every judgement came from the fix
range's own commits or from files that session does not touch.

## Open, not counted against this pass

- **Fix 5 (cross-feature) — owner ruling still open.** `copier.yml` `web_stack` defaults to `vite`;
  this feature's seams live in `apps/web-vite`, while `apps/web-next` (the sibling
  `web-stack-next`'s surface) has no favicon, no `product-routes.tsx`, no `registerProtectedRoute`.
  Confirmed **no `v2.4.0` AC fails because of it**: LOC-03, LOC-06 and SEAM-04 all pass on the
  default shell. Recorded as an open routing decision, per the coordinator's ruling.
- **CAT-05 — owner-gated.** `git tag -l 'catalog/*'` still empty; owner hand-off point 2 (the owner
  tags after wave 7). The agent never tags (AD-006/AD-034). Not a code gap.
- **TOOL-12 — spec-adjudicated.** `tasks.md:718` declares it "half-refuted"; T31 Done-when 2 keeps
  the documented 500-not-503 exclusion deliberately, so one pg literal is matched where the AC says
  both. Latency mitigated by a 2000 ms margin, not eliminated. Recorded so pass 2 does not
  re-litigate it as new.
- **The `booking` exception caveat** above — one-line reword, owner-routable.

---

# Round 1 — initial verification (historical)

**Diff range**: `92b4120..0422727`, interleaved with `prettier-format-gate` and `web-stack-next`;
attribution was by path and task, not position.

## Task Completion

T1–T48 all landed; waves 1–7 each closed on their own Build gate. Four tasks carried declared
deviations: **T16** (area-label placeholder shipped as a `gh label list` discovery instruction, not
a Jinja variable — adjudicated as satisfying the AC's shipped shape), **T43** (the `SPEC_DEVIATION`
exclusion of `docs/agents/harness.md` — confirmed **removed**), **T45** (`TOKEN_ALLOWLIST`
exemption for `openapi-config.ts`, to be cleared by T49), **T46** (domain-noun scanning not wired
end to end — adjudicated a real gap, fixed in round 2 by FT1).

## Spec-Anchored Acceptance Criteria

| Criterion | `file:line` + assertion | R1 | R2 |
| --- | --- | --- | --- |
| CLI-01 CLI runs in a child, never a module-resolution error | gate exit 0 + `smoke-runs-cli.test.mjs:128` — `assert.equal(code, EXIT_CODES.TEST_FAILURE)` on a reintroduced excluded import | ✅ | ✅ |
| CLI-02 guard fails on a `scripts/**` import of an `_exclude`d path | `excluded-imports.test.mjs:40-46` — `assert.deepEqual(offenders, [{file:"scripts/platform/cli.mjs", specifier:"./lib/lint.mjs", …}])` | ✅ | ✅ |
| CLI-03 `template:smoke` executes the CLI inside the child | `smoke-runs-cli.test.mjs:63-80` — `assert.equal(statusCall.options.cwd, childDir)` | ✅ | ✅ |
| RUN-01 exactly one API port across 10 sites | `canonical-port.test.mjs:29-54` — per-site `assert.equal(value, canonical)`; `:65` — `assert.equal(extractPort(...), "3000")` | ✅ | ✅ |
| RUN-02 shipped `REDIS_URL` authenticates against the shipped Redis | `redis-credential-match.test.mjs:28-33` (FT3) | ⚠️ | ✅ |
| RUN-03 every documented first-run command exists | `documented-commands.test.mjs:44-61` — `assert.ok(resolved, …)`; `copier-questions.test.mjs:101` for `_message_after_copy` | ✅ | ✅ |
| RUN-04 `format:check` completes without a plugin-load error | satisfied-by-sibling (`prettier-format-gate`, `266d2fd`..`60a011a`); evidence = `pnpm check` exit 0 | ✅ | ✅ |
| RUN-05 fixture repair stays documented | `fixture-repair-documented.test.mjs:13-23` — `assert.match(changelog, /Repair \`\.copier-answers\.yml\` by hand, once, before \`copier update\`/)` | ✅ | ✅ |
| BRAND-03 area-label placeholder, closed-list rule, neutral examples | `issue-tracker-labels.test.mjs:26-57` (FT10) | ⚠️ | ✅ |
| BRAND-04 P0 taxonomy generic, points at the product's domain doc | `harness-taxonomy.test.mjs:22-48`; wave-1 exclusion confirmed gone | ✅ | ✅ |
| BRAND-05 infra/deploy docs carry platform-level facts only | `docs-no-owner-infra.test.mjs:38-49` `OWNER_INFRA_TERMS` over `:76-84`; mutant 5 killed | ✅ | ✅ |
| BRAND-06 no legacy-MySQL backfill anywhere | `legacy-backfill-scan.test.mjs:42-47` (FT2) | ⚠️ | ✅ |
| BRAND-07 boundary guard covers the four roots | `module-boundaries.spec.ts:577-586` `KERNEL_SURFACE`, assertions `:671-680`; `TOKEN_ALLOWLIST:598` declared deviation for T49 | ✅ | ✅ |
| BRAND-08 no workflow wired to an absent module | `copier-questions.test.mjs:130-140` — `assert.deepEqual(tracked(".github/workflows/feedback-triage.yml"), [])` | ✅ | ✅ |
| CAT-01 every touched entry carries a new version | gate exit 0; five `module.json` at `2.0.2`; `ADV-20260822-0{1..5}.md:5` `affects: ">=1.0.0 <2.0.1"` | ✅ | ✅ |
| CAT-02 changed entry without a bump fails lint and CI | `lib/lint.mjs:225` wired at `catalog-lint.mjs:169`; 7 tests in `entry-bump-lint.test.mjs`; CI baseline `ci.yml:124-125` `fetch-depth: 0`; mutant 3 killed | ✅ | ✅ |
| CAT-03 a child at `v2.0.0` is reported affected by ADV-…-01..05 | `compute-pending-catalogref.test.mjs:123-147` — `assert.deepEqual(result.pending.map(a => a.id).sort(), […])`; mutant 2 killed | ✅ | ✅ |
| CAT-04 advisory paths are child-layout; `catalog/` rejected | `advisory-path-scope.test.mjs:27-34` — `assert.match(errors[0], /^detect referencia "catalog\/widget"/)` | ✅ | ✅ |
| CAT-05 a `catalog/<name>@x.y.z` tag exists per entry version | probe (budget 1/3, spent): `git tag -l 'catalog/*'` → **empty**. Owner hand-off point 2 | ⚠️ | ⚠️ |
| LOC-01 `product_locale` asked and threaded through four files | `copier-questions.test.mjs:38-47`, `:52-59`; `locale-threading.test.mjs:71-129` (FT9) | ❌ | ✅ |
| LOC-02 language convention stated once, referenced elsewhere | `locale-convention-reference-set.test.mjs:19-38` (FT4) | ⚠️ | ✅ |
| LOC-03 `VITE_APP_NAME`/`VITE_LOCALE` drive title, `<html lang>`, `pageTitle()` | `shell.test.tsx:37` — `expect(pageTitle()).toBe("Acme")`; `:42`; `:96` — `expect(indexHtml).toContain('lang="%VITE_LOCALE%"')`; `:30-31` default preserved | ✅ | ✅ |
| LOC-04 RFC 7807 / Zod strings from a `DEFAULT_LOCALE` pack | `shared/kernel/i18n/message-pack.ts` + `message-pack.spec.ts`; `problem-details.filter.spec.ts` | ✅ | ✅ |
| LOC-05 one message table per entry; no hardcoded timezone | `notification-catalog.spec.ts`; `catalog/{identity/single-tenant,attachment,tag}/api/domain/errors.spec.ts` | ✅ | ✅ |
| LOC-06 `/favicon.ico` served from a shipped `public/` | `favicon-route.test.mjs:30-40` (FT5) | ⚠️ | ✅ |
| SEAM-01 `rawBody: true` + `bootstrap.product.ts` before `listen` | `main.ts:45`; `bootstrap-product.e2e-spec.ts:81-83` — `expect(order).toEqual(["mountDocs","bootstrapProduct"])`; `copier.yml:72` `_skip_if_exists` | ✅ | ✅ |
| SEAM-02 one-shot `setTenant`; second call throws | `request-context.spec.ts:118-125` — `expect(() => { ctx.setTenant("t-2") }).toThrow(/tenantId já definido/)`; mutant 1 killed | ✅ | ✅ |
| SEAM-03 installing identity edits no platform web file | `seam-no-edit.test.mjs:41-87` (FT11) | ⚠️ | ✅ |
| SEAM-04 a product route joins last-location without editing `routes.ts` | `routes.ts:54` `registerProtectedRoute`; `routes.test.ts:54-58`; `last-location.test.ts:31-35` | ✅ | ✅ |
| SEAM-07 ownership table lists `main.ts` as platform | `ownership-table-seams.test.mjs:19-50` (FT6) | ⚠️ | ✅ |
| TOOL-01 entry point runs from a path containing a space | `is-main.test.mjs:82-83` — `assert.equal(result.stdout, "ran\n")`; `:59` — `assert.deepEqual(offenders, [])` | ✅ | ✅ |
| TOOL-02 lock paths relative to the child root | `lock-paths.test.mjs:42-45` — `assert.equal(…files[0].path, "apps/api/src/modules/alpha/alpha.module.ts")` | ✅ | ✅ |
| TOOL-03 describe-style `_commit` resolves the base tag | `template-version.test.mjs:353-357` — `assert.equal(readTemplateVersion(cwd), "2.2.1")` | ✅ | ✅ |
| TOOL-04 `--rollback` preserves the registry, exits non-zero | `rollback.test.mjs:98` — `assert.equal(exitCode, EXIT_CODES.CATALOG_UNREACHABLE)`; `:107-110` | ✅ | ✅ |
| TOOL-05 `--rollback` unwinds a failed `--with-deps`, or refuses | `rollback.test.mjs:139-153`; `:155-182` — `assert.equal(exitCode, EXIT_CODES.DESTINATION_EXISTS)` + `assert.match(stderr, /git checkout/)` | ✅ | ✅ |
| TOOL-06 detect failure gets a distinct code, never "not affected" | `advisory-exit-codes.test.mjs:82-83`, `:97-98`, `:114-117`, `:131-136`; mutant 4 killed | ✅ | ✅ |
| TOOL-07 a hook **or handbook** names only files that ship | `hook-references.test.mjs:63-73` (hooks) + the handbook walk (FT12) | ⚠️ | ✅ |
| TOOL-08 `pending-advisories` silent with nothing to adopt | `pending-advisories.test.mjs:141-142`, `:152-153`, `:180-181` — `assert.equal(result.stdout, "")` | ✅ | ✅ |
| TOOL-09 docs match the real pipeline, no Jest construct | `workflow-doc-pipeline-parity.test.mjs` (FT7) | ⚠️ | ✅ |
| TOOL-10 four sources state the dev-platform matrix | `dev-platform-matrix.test.mjs:19-47` (FT8) | ⚠️ | ✅ |
| TOOL-11 CI fails on contract drift, survives `module add` | `ci.yml:71` `- run: pnpm contract:check`; `contract-check-ci.test.mjs:35-43` | ✅ | ✅ |
| TOOL-12 503 + `Retry-After` for **both** pg timeout messages | `problem-details.filter.spec.ts:189-192` — `expect(r.status).toBe(503)` + `expect(r.headers["Retry-After"]).toBe("1")`. Only one pg literal exists; declared "half-refuted" at `tasks.md:718` | ⚠️ | ⚠️ |
| TOOL-13 `copier update` runs install/sync at most once | `copier-questions.test.mjs:78-96`; `child-lockfile.test.mjs:25-31` — `assert.equal(installs.length, 1)` | ✅ | ✅ |

## Round-1 Sensor

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| 1 | `request-context.ts:77` | One-shot guard flipped `!== null` → `=== undefined` | ✅ |
| 2 | `advisories.mjs:106` | `matchesCatalogRef` forced to `false` | ✅ |
| 3 | `release-preflight.mjs:83` | Bump rule inverted `===` → `!==` | ✅ |
| 4 | `advisory.mjs:65` | Detect-failed return `ADVISORY_DETECT_FAILED` → `OK` | ✅ |
| 5 | `.github/workflows/ci.yml` (seeded) | Owner infrastructure reintroduced | ✅ |
| 6 | `.github/workflows/ci.yml` (seeded) | Pilot-domain vocabulary reintroduced | ❌ → killed in round 2 |

## Edge Cases

- [x] Lock reads `identity 2.0.0` with a pre-remediation `catalogRef` → affected
      (`compute-pending-catalogref.test.mjs:37-56`)
- [x] `product_locale` absent → `pt-BR` default changes no shipped string. Round 1: inferred from
      `AGENTS.md.jinja` rendering byte-identical. Round 2: **asserted by render** at
      `locale-threading.test.mjs:125-129`
- [x] Rendered child with zero modules → session hook silent
      (`pending-advisories.test.mjs:141-142`)
- [x] `rg` absent → distinguishable from "advisory not found" (`advisory-exit-codes.test.mjs:82-83`)
- [x] `catalog:lint` on a CHANGELOG-only entry change — the shipped design **contradicts** the
      spec's edge case, deliberately and on record: wave 4 Finding 1 showed a CHANGELOG-only edit
      does move the entry and fires `entryChangedWithoutBump`; the owner chose to bump rather than
      weaken the rule

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ (the `v3.0.0` boundary held — T49–T79 untouched) |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ✅ after round 2 (11 gate/inspection proofs converted to assertions) |
| Per-layer Coverage Expectation met | ✅ |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | ✅ `docs/test/testing.md`, `docs/code-quality.md`, `AGENTS.md.jinja` |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 41/43 covered with evidence · 0 failed · 2 flagged (CAT-05 owner-gated,
TOOL-12 spec-adjudicated)
**Sensor**: round 2 7/7 killed · cumulative 12/13, the single round-1 survivor now dead
**Gate**: 8/8 exit 0 · 1212 tests (930 pre-feature, +282) · coverage ≥ 90 on all four axes

**What works**: the two round-1 blockers are closed and both closures are proven by mutation, not
asserted. The hygiene gate now catches pilot-domain vocabulary end to end, and its new seeded-noun
test shares the exact code path as the end-to-end scan — the pattern that let round 1's mutant
survive cannot recur. Every one of the seven Fix-3 guards derives its expected value from a second
source (compose vs `.env.example`, `lefthook.yml` vs the doc, `ci.yml` job keys vs the doc) rather
than restating a literal, so they discriminate rather than duplicate. FT12's handbook guard caught
a genuine stale reference on its first run.

**Issues found**: none blocking. Three items are routed to the owner: the `booking` exception's
one-line reword, Fix 5's cross-feature ruling on `apps/web-next`, and CAT-05's tag at hand-off
point 2.

**Next steps**: owner hand-off point 2 — dispatch the `v2.4.0` release and cut the
`catalog/<name>@x.y.z` tags CAT-05 observes. Waves 8–14 (`v3.0.0`) start after that tag exists.
