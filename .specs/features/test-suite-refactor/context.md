# Test Suite Refactor Context

**Gathered**: 2026-08-19 (test-quality audit), re-baselined 2026-08-21 after the v1 merge (`8bb606d`)
**Spec**: `.specs/features/test-suite-refactor/spec.md`
**Status**: defaults set by the agent — the owner flips any row on the spec before Design is approved

## Feature Boundary

**In**: how tests are written and enforced across the whole repository — the api harness (`apps/api/src/shared/test/**`), the entry-owned `catalog/<entry>/api/testing/**` barrels, the web harness, the lint rules that define "proof", the coverage bar on the post-v1 denominator, the CI that runs all of it, and `docs/test/testing.md`.

**Out**: what the tests assert about the product. No production behaviour changes in this feature — a mutant is injected and reverted by the Verifier, never committed. Module code does not move (v1 T22 did that), entries are not filled to 95 % (their own gate does that), and no mutation-testing tool is adopted.

**Absorbed**: `pre-push-coverage-95` in full (its COV requirements and its remaining fills), and v1's T26 (`docs/test/testing.md` rewrite).

## Implementation Decisions

### Area 1 — Sequencing (GA-1, resolved by events)

- The refactor runs on the post-v1 tree: the kernel in the template, the modules in `catalog/<entry>/api/**`. Every file is touched once, in its final home.
- The original options — refactor first on `main`, or inject the harness into v1 wave 3 — are void: v1 merged at `8bb606d` and is tagged `v1.0.0`.
- What survives as a rule: the first task checks the tree (five entries in `catalog/`, no module directories under `apps/api/src/modules/`) and stops if it does not match. It is a pre-flight, no longer a wait.

### Area 2 — Where the harness lives (GA-2)

- **Runner plumbing** stays in `apps/api/test/`: jest configs, global setup and teardown, the env files, container URIs, the docker runtime, the scalar stub. Nothing a spec imports.
- **Everything a spec imports** lives in `apps/api/src/shared/test/{unit,int,e2e,parity,hygiene}` — kernel vocabulary only, alongside the `parity/contract-snapshot.ts` that already made this folder the allow-listed home.
- **Entry-owned helpers** (`seedUser`, `loginAs`, `FakeMailer`, `inMemoryStorage`, `PNG_1PX`, the builders) live in `catalog/<entry>/api/testing/**` and reach the child at `apps/api/src/modules/<entry>/testing/**` through `module.json.files`.
- Rationale: RULE C forbids module vocabulary in `shared/**`. A kernel harness that knows what a user is could not survive identity being an entry.
- Partly built already: identity and notification each have a `testing/` folder with loose files and no `index.ts`; attachment, tag and audit have none.

### Area 3 — Unit doubles (GA-3)

- Typed mock factories by default (`mockOf<T>()`), stateful in-memory fakes only where a spec asserts on persisted state, and those fakes are entry-owned.
- Rationale: 736 `jest.fn(` sites already exist; a full in-memory repository layer would be a parallel implementation to maintain per entry, in every child.
- An unstubbed method must reject, not return `undefined` — a spec that passes by accident is worse than one that fails.

### Area 4 — Fixtures (GA-4)

- One `make<Entity>(overrides)` per aggregate, owned by the entry's `testing/` barrel, plus named constants (`TEST_PASSWORD`, `FIXED_NOW`, `emails.*`) in the same place.
- Replaces 21 local `makeUser` definitions, 45 `User.fromProps({` literals in specs and 288 raw `@example.com` strings.

### Area 5 — Test lint (GA-5)

- api: `eslint-plugin-jest`; web: `@vitest/eslint-plugin` + `eslint-plugin-testing-library` + `eslint-plugin-jest-dom`. Recommended presets plus `no-focused-tests`, `no-disabled-tests`, `expect-expect`, `no-conditional-expect` as errors.
- One local rule, `no-existence-only-assert`, following the `sr-only-requires-positioned-ancestor` precedent (rule file plus `RuleTester` suite, registered in the shared config).
- Rationale: the handbook rule about what counts as proof has existed since lesson L-007 and is still violated 41 + 27 times in the tree.

### Area 6 — CI (GA-6)

- One new `.github/workflows/ci.yml` with `check`, `unit`, `int`, `e2e`, `contract`, `coverage-all`; the existing `catalog.yml` keeps its own trigger surface and is not merged into it.
- Pre-push stays Docker-free — inherited from the absorbed coverage feature, unchanged.

### Area 7 — Proof that the refactor did not weaken the suite (GA-7)

- Three mechanical invariants: the `it` count per original file (summed across splits, matched by preserved titles) never drops; the sensor mutants are killed after the refactor; no `.skip`/`.only`/`it.todo` is introduced.
- No behavioural test is deleted. A test found to assert nothing is strengthened. The single exception is the "seed master" pseudo-test in `create-user-flow`, which asserts `toBeTruthy` on a seed and is removed when the ordered chain is split.

### Area 8 — How the bans are enforced (new, 2026-08-21)

- The duplication bans are a committed guard spec (`apps/api/src/shared/test/hygiene/harness-hygiene.spec.ts`), not greps written into acceptance criteria.
- Rationale: a grep in a spec dies with the feature and cannot protect a child repository; a spec runs forever, in the template and in every child, and keeps this feature inside the framework's ≤3-probe budget.

### Agent's Discretion

- Exact file split inside `shared/test/{unit,int,e2e}` and the barrel shape of each `index.ts`.
- Which `it` bodies are split versus merged when an ordered chain is broken, as long as the titles survive for the count baseline.
- Wording of the harness error messages, and the internals of `it-count.mjs`.
- Cluster and wave composition in `tasks.md`, within the framework's rules.

### Declined / Undiscussed Gray Areas → Assumptions

Every row below is an agent default recorded in `spec.md` § *Assumptions & Open Questions*, unconfirmed by the owner:

- GA-2 harness home, GA-3 doubles, GA-4 fixtures, GA-5 lint plugin set, GA-6 CI layout, GA-7 non-weakening proof.
- `FakeMailer` single owner (notification, with identity importing along its existing `dependsOn` edge).
- Redis int-specs move to the global container instead of keeping their own.
- The coverage denominator excludes the harness and the entry `testing/**`.
- GAP-02 resolved by writing the four missing facade specs rather than retiring the handbook rule.

## Specific References

- `docs/test/testing.md` — the document this feature rewrites; still describes helpers in `apps/api/test/setup/*` and a CI that never ran.
- `docs/back/back-arch.md` § *Testes* — owns the facade-shape requirement (GAP-02); rewritten by v1 HBK-02, not here.
- `.specs/STATE.md` — AD-012, AD-013 (RULE C), AD-019, AD-021, AD-024, AD-025, AD-026; AD-023 is appended by this feature.
- `packages/eslint-config/rules/sr-only-requires-positioned-ancestor.{js,test.js}` and `react.js:9,13,66` — the local-rule precedent.
- `apps/api/src/modules/module-boundaries.spec.ts` — host of RULE D.
- `scripts/platform/catalog-check.mjs` — proves `module.json.files` really carries `testing/**`.

## Deferred Ideas

- A permanent mutation-testing tool (Stryker) in CI — the sensor stays manual and bounded for now.
- In-memory fake repositories for every port (approach C in `design.md`): the right long-term shape, too expensive as part of this refactor.
- Browser or visual tests for web, while the template web is a router shell.
- Extending the guard spec into a published lint plugin for children — worth doing once the rule set has settled.
