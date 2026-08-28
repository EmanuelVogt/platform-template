# Validation — Verifier pass 3 (narrowed)

**Feature**: `audit-2026-08-23-remediation` · **HEAD**: `d8b5487` · **Branch**: `main` · **Date**: 2026-08-28
**Verdict**: **PASS**
**Scope (owner-narrowed)**: (1) re-check the 9 gap rows pass 2 returned as FAIL; (2) inject a fresh
sensor set on the lines Fix Round 4 fixed; (3) independently verify the newly landed IDENT-03 guard.
The Final gate was **not** re-run, per the owner's ruling.

This file exists because pass 2's evidence was held only in context and was lost to a `/clear`.

---

## 1. The 9 gap rows, re-checked one by one

The 9 rows are the non-gate bullets of the three Fix Round 4 clusters in `tasks.md` (3 in C24-fr4,
2 in C25-fr4, 4 in C26-fr4). Each verdict below carries `file:line` plus the asserting expression.

### C24-fr4 — kernel test hardening

**G1 — `APP_TIMEZONE` had no test at all** (the refine at `env.ts:73-82` survived a `() => true`
mutant because nothing covered it). → **CLOSED**.
Four `it`s inside `describe("parseEnv")`, `apps/api/src/shared/config/env.spec.ts:151-176`:
- `:154` `expect(e.APP_TIMEZONE).toBeUndefined()` — absent, and there is no default.
- `:160` `expect(e.APP_TIMEZONE).toBe("UTC")`.
- `:169` `expect(e.APP_TIMEZONE).toBe("Asia/Tokyo")` — a deliberately neutral IANA zone, so the
  assertion does not force `brand-hygiene` to open an exception for a test written this round.
- `:172-175` `expect(() => parseEnv({ ...BASE, APP_TIMEZONE: "Not/AZone" })).toThrow(/APP_TIMEZONE/)`.
Discriminating: proved by **Sensor 1** below.

**G2 — `STORAGE_REGION` was never asserted missing** (the existing missing-key case drops only
`STORAGE_BUCKET`). → **CLOSED**.
`apps/api/src/shared/infra/storage/storage.config.spec.ts:29-32` — `it("rejeita STORAGE_REGION
faltando")`, destructures `STORAGE_REGION` out of `valid` and asserts
`expect(() => parseStorageConfig(rest)).toThrow()`. The schema it targets is
`storage.config.ts:8` `STORAGE_REGION: z.string().min(1)`.
Discriminating: proved by **Sensor 2**.

**G3 — the `R2_*` → `STORAGE_*` rename was wider than pass 2 reported** (stale at four sites).
→ **CLOSED, and wider than the row recorded.**
All four named sites now carry `STORAGE_*`:
- `apps/api/test/setup/e2e-env.ts:21-25` — `STORAGE_ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET/ENDPOINT/REGION`.
- `apps/api/test/runner-env.e2e-spec.ts:29-39` — the `toEqual` compares all five renamed keys.
- `scripts/platform/lib/child.mjs:20-24` — `CHILD_ENV_DEFAULTS` seeds the five `STORAGE_*`.
- `scripts/platform/__tests__/catalog-check.test.mjs:292,300-304,337-347` — asserts that seeding.
Plus the four CI env blocks the Touches audit had missed (`902c72d`): `ci.yml:78-82` and `:185-189`,
`release.yml:64-68` and `:116-120` — the second of which is the job that holds the tag.
A repo-wide sweep for `R2_` over `*.ts|*.mjs|*.mts|*.yml|*.yaml|*.jinja|*.json` returns only:
`scripts/platform/migrations/v3.0.0.mjs:11,14-17` and `migration-v3.test.mjs:23,25,35,42` (the
migration performs the rename — the old names are its fixture input, marked INTENTIONAL in
`tasks.md`), and `docs/platform_template/audit-2026-08-23.json` (the historical audit record).
`R2_ACCOUNT_ID` was dropped rather than renamed — it has no `STORAGE_*` counterpart.
Discriminating: proved by **Sensor 3**.

### C25-fr4 — the parity proof, and the stage leak

**G4 — the parity gap is structural, three layers deep.** → **CLOSED (two layers fixed, one
deliberately not).**
- Layer 1 — `scripts/platform/catalog-stage.mjs:36-39`: `stagePlan` now emits a second copy per
  entry, `from: path.join(entry.dir, "parity")` → `to: path.join(stageRoot, "src/modules",
  entry.name, "__parity__")`. Asserted at `scripts/platform/__tests__/catalog-stage.test.mjs:28-49`
  — for every entry that has a `parity/` dir, a copy exists and its `to` equals
  `<STAGE_DIR>/src/modules/<entry>/__parity__`.
- Layer 2 — `apps/api/vitest.catalog.config.mts:14` include is **unchanged**, correctly: the chosen
  destination (`__parity__` as a sibling of `application/domain/infrastructure`, the exact path
  `child-layout.mjs` `parityDir()` already uses) falls inside the existing
  `.catalog-stage/src/modules/**/*.spec.ts` glob. Matching the installed layout is a better fix
  than widening the glob, and it is why the specs' relative imports resolve identically staged and
  installed. 15 `*.parity.spec.ts` exist under `catalog/`; `contract.parity.spec.ts` is excluded at
  `:25` with a recorded rationale.
- Layer 3 — `vitest.coverage.mts` **deliberately carries no catalog path**, per the owner's ruling.
  Verified at HEAD: `:19-24` `projects` lists only web + api/int/e2e, and `:35` `coverage.include`
  is `["apps/api/src/**/*.ts", "<WEB_DIR>/src/**/*.{ts,tsx}"]`. Measured catalog coverage
  (73.68 / 72.51 / 65.15 / 74.51) is below the flat 90 floor at `:64-84`, so re-adding it would
  redden the `coverage` job that gates the release. **Correctly left out.**
Discriminating: proved by **Sensor 4**.

**G5 — the stage leak (`ENOTEMPTY … rmdir '.../apps/api/.catalog-stage'`).** → **CLOSED.**
`catalog-stage.mjs:52-61` `removeStageTree(plan)` unlinks each `KERNEL_STAGE_PATHS` symlink first
(`rmSync(link.to, …)` per link, no descent into the target) and only then removes the tree, with
`maxRetries: 3, retryDelay: 100`. The companion re-entrancy fix — an optional `stageRoot` parameter
so concurrent `node --test` files stop sharing one physical path — is at `:15-19`, landed in
`630a41a` by a sibling session; closed, not re-litigated here. Observed green: `pnpm test:scripts`
816/816 exit 0 (§ 3).

### C26-fr4 — brand hygiene gains `scripts/**`

**G6 — `brand-hygiene` did not scan `scripts/**`, so `v3.0.0.mjs:28`'s owner timezone reached every
generated child.** → **CLOSED.**
`scripts/platform/__tests__/brand-hygiene.test.mjs:81` `const SCRIPTS_SCAN_ROOTS = ["scripts"]`.

**G7 — widen the scan *and* give the historical constant an explicit, commented exemption.**
→ **CLOSED.**
`KNOWN_EXCEPTIONS:137` `"scripts/platform/migrations/v3.0.0.mjs": ["America/Sao_Paulo"]`, preceded
by a `SPEC_DEVIATION:` / `Reason:` block at `:115-124` explaining that the literal is the value a
`2.x` child actually had hard-coded (commit `4b614eb`) and that the migration cannot identify the
old value without naming it. This is an exemption, not an exclusion from the child.

**G8 — extend the roots.** → **CLOSED, and wired.**
`:379` `const files = scannedFiles(childDir, SCRIPTS_SCAN_ROOTS)`, `:381-383` asserts
`files.length > 0` (so the root cannot pass by scanning nothing), `:384`
`assert.deepEqual(codeViolationsIn(childDir, files), [])`. A seeded-red self-test follows at
`:386-398`: four tokens (`__Host-rit`, `rit_`, `rit-`, `America/Sao_Paulo`) are written to
`scripts/_seed-scripts-hygiene.mjs` in the rendered child and each must appear in the violations.
The constant is therefore not declared-but-unused — the classic failure mode here.

**G9 — use the existing exception mechanism.** → **CLOSED.**
`withoutKnownExceptions(hits, rel)` at `:141-144` filters by the `KNOWN_EXCEPTIONS[rel]` list and is
reached through `codeViolationsIn` at `:238`, the same path `CODE_SCAN_ROOTS` already used.

**Tally: 9 of 9 gap rows closed with evidence. 0 remaining.**

---

## 2. Sensor set — 8 injected, 8 killed, 0 survived

Pass 2's three survivors were only ever counted, never named, so they cannot be re-run. This is a
**fresh** set aimed at the lines Fix Round 4 actually fixed, plus three aimed at the new IDENT-03
guard. Protocol per mutant: `git status --short` clean beforehand → mutate the real file → run only
the scoped gate → confirm RED → `git checkout -- <file>` → confirm `git status --short -- <file>`
empty. No backup file was ever written inside the repo tree; no `stash`, no branch, no worktree.

Baseline for sensors 1-2: `pnpm vitest run env.spec.ts storage.config.spec.ts` → **exit 0**,
34 tests / 3 files.

| # | Target | Mutation | Scoped gate | Result |
| --- | --- | --- | --- | --- |
| S1 | `apps/api/src/shared/config/env.ts:76` | refine predicate `(v) => v === "UTC" \|\| Intl.supportedValuesOf("timeZone").includes(v)` → `(v) => Boolean(v)` | `pnpm vitest run env.spec.ts` | **KILLED** — exit 1, 1 failed / 26 passed. `env.spec.ts:172` `AssertionError: expected [Function] to throw an error`. This is the pass-2 survivor class, now caught. |
| S2 | `apps/api/src/shared/infra/storage/storage.config.ts:8` | `z.string().min(1)` → `z.string().min(1).optional()` | `pnpm vitest run storage.config.spec.ts` | **KILLED** — exit 1, 1 failed / 6 passed, at `storage.config.spec.ts:29`. |
| S3 | `scripts/platform/lib/child.mjs:24` | `STORAGE_REGION: "placeholder"` → `R2_REGION: "placeholder"` (rename regressed) | `node --test scripts/platform/__tests__/catalog-check.test.mjs` | **KILLED** — exit 1, pass 29 / fail 1, `not ok 9`. |
| S4 | `scripts/platform/catalog-stage.mjs:37` | parity copy source `path.join(entry.dir, "parity")` → `"parity__none"`, so the `existsSync` filter drops every parity copy (the original G4 regression) | `node --test scripts/platform/__tests__/catalog-stage.test.mjs` | **KILLED** — exit 1, pass 3 / fail 1, `not ok 2`. |
| S5 | `scripts/platform/__tests__/brand-hygiene.test.mjs:137` | delete the `v3.0.0.mjs` entry from `KNOWN_EXCEPTIONS` | `node --test scripts/platform/__tests__/brand-hygiene.test.mjs` | **KILLED** — exit 1, pass 14 / fail 1, `not ok 14`, with the literal violation `scripts/platform/migrations/v3.0.0.mjs carrega o fuso horário hard-coded do dono: America/Sao_Paulo`. **This is the load-bearing result for C26**: the widened scan really reaches the file, so the exemption is a live suppression and not decoration over a scan that matched nothing. |

### The IDENT-03 guard, sensored independently (scope item 3)

Baseline: `node --test scripts/platform/__tests__/ident-03-extraction-advisories.test.mjs`
→ **exit 0**, pass 4 / fail 0.

| # | Claim under test | Mutation | Result |
| --- | --- | --- | --- |
| S6 | The guard requires a `breaking` advisory per affected entry | `docs/advisories/ADV-20260824-02.md:3` `kind: "breaking"` → `kind: "fix"` | **KILLED** — exit 1, pass 1 / fail 3. Tests 2, 3 and 4 all go red. |
| S7 | The affected set is **derived, not pinned** | created a synthetic entry `catalog/_sensor7/` (`module.json` + `probe.ts` naming `professional_profile`) with no advisory | **KILLED** — exit 1, pass 3 / fail 1, error names the entry verbatim: `a entrada "_sensor7" é afetada pela extração da fatia profissional e não tem advisory kind:"breaking"`. A *future* entry that starts naming the slice without an advisory goes red by construction. |
| S8 | The guard requires the **extraction's signature**, not merely "some breaking advisory" | kept `_sensor7`, added `docs/advisories/ADV-20991231-99.md` — `kind: "breaking"`, `module: "_sensor7"`, but naming no slice table and no destination entry (a jest-to-vitest-shaped advisory) | **KILLED** — exit 1, pass 3 / fail 1, same assertion. A `kind: "breaking"` advisory on the right module does **not** satisfy the guard. `isExtractionAdvisory` (`:110-121`) requires `SLICE_TABLES.some(…)` **AND** `DESTINATION_MENTION.test(…)`. Both of the orchestrator's claims verified. |

**Both `_sensor7` artifacts were untracked; removed with `rm`.** `git status --short` and
`git status --short --untracked-files=all -- catalog docs scripts apps` both print nothing at the
end of the round. No `.bak` file was created anywhere (the `sed -i.bak` failure mode of the previous
round was avoided by mutating with `python3` in-place rewrites and restoring via `git checkout --`).

### How the derived set actually resolves at HEAD

Recorded so a future pass does not have to re-derive it. `affectedEntries()` (`:132-164`) unions:
- **(a)** `catalog/professional/module.json` `dependsOn: [{ name: "identity", range: ">=3.0.0 <4.0.0" }]`
  → matched to `identity/single-tenant` by the `entry.name.startsWith(depName + "/")` arm at `:151`.
- **(b)** entries whose non-`.md` sources still name a slice table → `catalog/audit`
  (`api/domain/audit-coverage.ts:34-37`, `api/domain/base-audit-registrations.ts:57,63`) and
  `catalog/identity/single-tenant` (`api/__e2e__/…`).

Set = `{ identity/single-tenant, audit }`, size 2, matching `MIN_AFFECTED_ENTRIES = 2`. Both carry
their advisory: `ADV-20260824-01` (`identity/single-tenant`, critical) and `ADV-20260824-02`
(`audit`, high). The AC it proves — `spec.md:319-320`, *"WHEN the extraction ships THEN a new AD
SHALL record it and a `breaking` advisory SHALL ship per affected entry"* — is covered on both
halves: the AD half by test 1 (`AD-035` present, `status` matches `/^active\b/`, row text matches
`/catalog\/professional\//` and `/dependsOn/`), the advisory half by test 2. `Proof = test` at
`spec.md:402` is satisfied by a real discriminator, not by fixture-pinning.

---

## 3. Commands run, with exit codes

| Command | Exit | Counts |
| --- | --- | --- |
| `pnpm vitest run env.spec.ts storage.config.spec.ts` (baseline) | 0 | 34 tests / 3 files |
| `pnpm vitest run env.spec.ts` (S1) | 1 | 1 failed / 26 passed |
| `pnpm vitest run storage.config.spec.ts` (S2) | 1 | 1 failed / 6 passed |
| `node --test …/catalog-check.test.mjs` (S3) | 1 | pass 29 / fail 1 |
| `node --test …/catalog-stage.test.mjs` (S4) | 1 | pass 3 / fail 1 |
| `node --test …/brand-hygiene.test.mjs` (S5) | 1 | pass 14 / fail 1 |
| `node --test …/ident-03-extraction-advisories.test.mjs` (baseline) | 0 | pass 4 / fail 0 |
| same (S6) | 1 | pass 1 / fail 3 |
| same (S7) | 1 | pass 3 / fail 1 |
| same (S8) | 1 | pass 3 / fail 1 |
| `pnpm test:scripts` (post-restore integrity run, clean stage) | **0** | **816 / 816** |

The closing `test:scripts` run matches the payload's HEAD baseline exactly (816/816) and contains
the IDENT-03 guard's four subtests, which confirms both that the new file joins the `test:scripts`
glob and that the sensor round left no residue.

**Not run, deliberately**: the Final gate. `pnpm catalog:check` (~20 min, Docker) was not run;
`pnpm test` (769/109), `pnpm catalog:test` (941/132) and `pnpm format:check` (exit 0) are taken from
the payload's HEAD baseline and were not re-derived.

---

## 4. New findings

None blocking. Two minor observations on the new guard, and two confirmations of state.

1. **`ident-03-extraction-advisories.test.mjs:36,123-130` couples the guard to a `.specs/STATE.md`
   table row by exact prefix** (`line.startsWith("| AD-035 |")`, then a `|`-split with positional
   cells 2 and 3). `.specs/` has contended writers and that row's column layout is not a contract, so
   a reformat or an AD renumber breaks the guard for a reason unrelated to IDENT-03. Not a
   correctness defect — both `.specs/` (`copier.yml:25,74`) and `scripts/platform/__tests__`
   (`copier.yml:69`) are copier-excluded, so no generated child is affected. Cost is maintenance
   only. *Candidate for a follow-up spec, not for the cut.*
2. **`MIN_AFFECTED_ENTRIES = 2` equals the current derived set size**, so the floor is a
   total-count check rather than a per-arm one. If arm (a) and arm (b) each lost and gained one
   entry, the total would stay 2 and the floor would not notice. The floor still does its stated job
   (catching a derivation that matches nothing), and S7/S8 show the derivation itself is live.
   *Minor; noted, not owned.*
3. **Confirmed still open, named not absorbed** (Fix Round 4 finding #2): the pilot-domain leak at
   `scripts/contract-consumers.mjs:11,42` — `createReservation` / `createReservationHold` in
   illustrative comments, in a file the child receives. `SCRIPTS_SCAN_ROOTS` was deliberately scoped
   to brand + timezone only (on the `CODE_SCAN_ROOTS` precedent), so the leak is real and unguarded.
   Out of scope by the owner's ruling.
4. **Confirmed closed, not re-litigated**: `release.yml:86` now reads
   `entry: [identity, attachment, audit, notification, tag, professional]` — the `professional` leg
   is present in the matrix that holds the tag (fixed in `10477a2`).

**Out of scope by the owner's ruling and untouched by this pass**: the two blind guards
(`kernel-version.mjs:82-83`, `docs-stay-lean.mjs:113-119`); the three debts (16 `rit_*` sites in
`catalog/identity/single-tenant`, `it-count.mjs:8` `REQUIRED_ENTRIES` lacking `professional`,
identity's `CHANGELOG.md` omitting the additive `UserDirectoryFacade` methods); IDENT-02, the
advisory ledger (#11) and HIBP. The `.catalog-stage` re-entrancy flake (`630a41a`) was not reopened.

---

## 5. What this PASS certifies — and what it does not

**It certifies**, at `d8b5487` with a clean tree:
- All 9 gap rows returned by pass 2 are closed, each with a named assertion at `file:line`.
- 8 fresh mutants on the lines Fix Round 4 fixed were injected and **all 8 were killed**; every one
  was restored and the tree verified clean.
- The IDENT-03 guard was verified independently of the orchestrator's own report. Its two load-bearing
  claims hold: the affected-entry set is **derived** (S7 — a new entry naming the slice goes red) and
  the advisory must carry the **extraction's signature** (S8 — a `breaking` advisory on the right
  module, without a slice table and a destination mention, does not satisfy it).
- `pnpm test:scripts` is 816/816, exit 0, on a clean stage, and includes the new guard.

**It does not certify**:
- **The full suite was not re-run this pass.** The Final gate stays unrepeated by the owner's ruling.
  `pnpm catalog:check` — the only tier that renders and boots a real child, and the tier that proved
  IDENT-02 — has not run at this HEAD. `pnpm test`, `pnpm catalog:test` and `pnpm format:check` are
  quoted from the payload baseline, not re-measured.
- **Catalog coverage remains outside the coverage gate**: 73.68 / 72.51 / 65.15 / 74.51 against a
  flat 90 floor, with the `tag` module's source at 0%. Correctly excluded rather than fixed; the
  release ships with catalog source unmeasured by `release.yml`'s `coverage` job. Owed to its own spec.
- **Pass 2's three surviving mutants are not accounted for.** They were never named, so this set is
  new work, not a re-run. Whatever those three were, nothing here proves they are dead — only that
  eight different mutants on the fixed lines are.
- Nothing in the "out of scope" list above was verified, and no AC other than IDENT-03 was
  re-derived this pass (the pass is narrowed by ruling; rounds 1-3 in `validation.md` cover the rest).
